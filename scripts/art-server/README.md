# Art server

Open-weight backend for `scripts/gen-art.ts --backend gpu`, used while Bedrock is unavailable.

| Job | Model | Licence |
|---|---|---|
| Draw (default) | Stable Diffusion 3.5 Large | Stability AI Community License (free under $1M annual revenue) |
| Draw (alt) | FLUX.1-schnell | Apache-2.0 |
| Judge | Qwen2.5-VL-7B-Instruct, 4-bit | Apache-2.0 |
| Cutout | BiRefNet | MIT |

Box: one `g6e.xlarge` (L40S 48 GB), Ubuntu 24.04 with the NVIDIA driver, 150 GB gp3. The server binds to
127.0.0.1:8188, so nothing is open to the internet; the Mac reaches it through an SSH tunnel and keeps doing
the S3 upload and manifest update itself.

```bash
scp -r scripts/art-server ubuntu@BOX:~/
ssh ubuntu@BOX 'HF_TOKEN=hf_... bash ~/art-server/setup.sh'
ssh ubuntu@BOX 'cd ~/art-server && source .venv/bin/activate && HF_HOME=~/hf nohup python server.py > server.log 2>&1 &'
ssh -N -L 8188:127.0.0.1:8188 ubuntu@BOX &
curl -s 127.0.0.1:8188/health

# smoke test: a few players with each drawing model
node scripts/gen-art.ts --backend gpu --model sd35 --only "ENG:Bukayo Saka,CRO:Luka Modrić" --force --preview
node scripts/gen-art.ts --backend gpu --model flux --only "ENG:Bukayo Saka,CRO:Luka Modrić" --force --preview
# full run (skips players already done)
node scripts/gen-art.ts --backend gpu --tries 4
```

Stop the instance when the run ends; terminate it and delete the volume once the art is final.
