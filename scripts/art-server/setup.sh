#!/usr/bin/env bash
# Bootstrap the art server on a fresh GPU box (Ubuntu 24.04, NVIDIA driver already present, e.g. the AWS
# "Deep Learning Base OSS Nvidia Driver GPU AMI"). Idempotent: rerun after a stop/start.
#
#   scp -r scripts/art-server ubuntu@BOX:~/
#   ssh ubuntu@BOX 'HF_TOKEN=hf_... bash ~/art-server/setup.sh'
#
# HF_TOKEN must belong to an account that accepted the gates on SD3.5 Large (Stability Community License) and FLUX.1-schnell.
set -euo pipefail
cd "$(dirname "$0")"

nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

uv venv --python 3.12 --allow-existing .venv
# shellcheck disable=SC1091
source .venv/bin/activate
uv pip install -r requirements.txt

# Weights go to the root volume cache (~60 GB for SD3.5 Large + FLUX.1-schnell + Qwen2.5-VL-7B + BiRefNet).
export HF_HOME="$HOME/hf"
if [ -n "${HF_TOKEN:-}" ]; then
  python -c "import huggingface_hub as h; h.login(token='${HF_TOKEN}', add_to_git_credential=False)"
fi
python - <<'PY'
from huggingface_hub import snapshot_download
for repo in [
    "stabilityai/stable-diffusion-3.5-large",
    "black-forest-labs/FLUX.1-schnell",
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "ZhengPeng7/BiRefNet",
]:
    try:
        snapshot_download(repo, ignore_patterns=["*.bin", "*.pth", "*.gguf", "sd3.5_large.safetensors", "flux1-schnell.safetensors", "ae.safetensors"])
        print("ok", repo)
    except Exception as error:  # a gated repo without access should not stop the others
        print("FAILED", repo, str(error)[:160])
PY

cat > "$HOME/art-server.env" <<EOF
HF_HOME=$HOME/hf
EOF
echo "Start: cd ~/art-server && source .venv/bin/activate && HF_HOME=~/hf python server.py"
