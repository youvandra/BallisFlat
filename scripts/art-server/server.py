"""Art server for scripts/gen-art.ts --backend gpu.

Open-weight stand-ins for the three Bedrock models the art pipeline used:
  draw    Stable Diffusion 3.5 Large (open base of Stable Image Ultra) or FLUX.1-schnell
  judge   Qwen2.5-VL-7B-Instruct, 4-bit, answers the same rubric with a JSON verdict
  cutout  BiRefNet background removal, returns a transparent PNG

Binds to 127.0.0.1 only: reach it through an SSH tunnel. One request runs at a time, and only one drawing
model sits on the GPU (switching models unloads the other), so a 48 GB L40S holds everything.

  HF_TOKEN=... uvicorn server:app --host 127.0.0.1 --port 8188
"""

import base64
import gc
import io
import os
import threading

import torch
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

DEVICE = "cuda"
SIZES = {"4:5": (896, 1120), "1:1": (1024, 1024)}
DRAW_MODELS = {
    "sd35": "stabilityai/stable-diffusion-3.5-large",
    "flux": "black-forest-labs/FLUX.1-schnell",
}
JUDGE_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct"
CUTOUT_MODEL = "ZhengPeng7/BiRefNet"

app = FastAPI()
lock = threading.Lock()
state: dict = {"draw_name": None, "draw": None, "judge": None, "processor": None, "cutout": None}


def b64_to_image(data: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


def image_to_b64(image: Image.Image, fmt: str) -> str:
    buffer = io.BytesIO()
    if fmt == "JPEG":
        image.convert("RGB").save(buffer, fmt, quality=92)
    else:
        image.save(buffer, fmt)
    return base64.b64encode(buffer.getvalue()).decode()


def drawing_pipeline(name: str):
    if state["draw_name"] == name:
        return state["draw"]
    state["draw"] = None
    state["draw_name"] = None
    gc.collect()
    torch.cuda.empty_cache()
    if name == "sd35":
        from diffusers import StableDiffusion3Pipeline

        pipe = StableDiffusion3Pipeline.from_pretrained(DRAW_MODELS[name], torch_dtype=torch.bfloat16)
    elif name == "flux":
        from diffusers import FluxPipeline

        pipe = FluxPipeline.from_pretrained(DRAW_MODELS[name], torch_dtype=torch.bfloat16)
    else:
        raise HTTPException(400, f"unknown model {name}")
    pipe.to(DEVICE)
    pipe.set_progress_bar_config(disable=True)
    state["draw"], state["draw_name"] = pipe, name
    return pipe


def judge_model():
    if state["judge"] is None:
        from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2_5_VLForConditionalGeneration

        state["judge"] = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            JUDGE_MODEL,
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16
            ),
            device_map=DEVICE,
        )
        # Cap the image at ~1 MP of visual tokens: enough to see limbs and logos, fast to read.
        state["processor"] = AutoProcessor.from_pretrained(
            JUDGE_MODEL, min_pixels=256 * 28 * 28, max_pixels=1280 * 28 * 28
        )
    return state["judge"], state["processor"]


def cutout_model():
    if state["cutout"] is None:
        from transformers import AutoModelForImageSegmentation

        model = AutoModelForImageSegmentation.from_pretrained(CUTOUT_MODEL, trust_remote_code=True)
        state["cutout"] = model.to(DEVICE).eval().half()
    return state["cutout"]


class DrawRequest(BaseModel):
    model: str = "sd35"
    prompt: str
    negative: str = ""
    seed: int
    aspect: str = "4:5"


class JudgeRequest(BaseModel):
    image: str
    rubric: str


class CutoutRequest(BaseModel):
    image: str


@app.get("/health")
def health():
    return {
        "gpu": torch.cuda.get_device_name(0),
        "loaded": state["draw_name"],
        "free_gb": round(torch.cuda.mem_get_info()[0] / 1e9, 1),
    }


@app.post("/draw")
def draw(request: DrawRequest):
    if request.aspect not in SIZES:
        raise HTTPException(400, f"unknown aspect {request.aspect}")
    width, height = SIZES[request.aspect]
    with lock:
        pipe = drawing_pipeline(request.model)
        generator = torch.Generator(DEVICE).manual_seed(request.seed)
        if request.model == "flux":
            # schnell is distilled: 4 steps, no guidance, no negative prompt.
            image = pipe(
                request.prompt,
                width=width,
                height=height,
                num_inference_steps=4,
                guidance_scale=0.0,
                max_sequence_length=256,
                generator=generator,
            ).images[0]
        else:
            image = pipe(
                request.prompt,
                negative_prompt=request.negative or None,
                width=width,
                height=height,
                num_inference_steps=28,
                guidance_scale=3.5,
                generator=generator,
            ).images[0]
    return {"image": image_to_b64(image, "JPEG")}


@app.post("/judge")
def judge(request: JudgeRequest):
    picture = b64_to_image(request.image)
    with lock:
        model, processor = judge_model()
        messages = [
            {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": request.rubric}]}
        ]
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = processor(text=[text], images=[picture], return_tensors="pt").to(DEVICE)
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=300, do_sample=False)
        answer = processor.batch_decode(
            output[:, inputs["input_ids"].shape[1] :], skip_special_tokens=True
        )[0]
    return {"text": answer}


@app.post("/cutout")
def cutout(request: CutoutRequest):
    from torchvision import transforms

    picture = b64_to_image(request.image)
    prepare = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    with lock:
        model = cutout_model()
        batch = prepare(picture).unsqueeze(0).to(DEVICE).half()
        with torch.inference_mode():
            mask = model(batch)[-1].sigmoid().float().cpu()[0].squeeze()
    alpha = transforms.functional.to_pil_image(mask).resize(picture.size)
    rgba = picture.copy()
    rgba.putalpha(alpha)
    # Keep the full frame, like the Bedrock cutout: the app sizes every card from the same canvas.
    return {"image": image_to_b64(rgba, "PNG")}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8188")))
