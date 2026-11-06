"""Real question-versus-answer probabilities at each training stage, for the training replay slide.

Rows are 8 questions, columns their 8 answers. Each row is the head's own softmax over the 8 answers.
    modal run stage_matrix.py --out ../site/matrix.json
"""
import json
import math
import subprocess
import time

import modal

COMMIT = "d5f9ef0fd9bde185df0ceaad4f4ecc6cfe8c34f6"
image = (modal.Image.debian_slim(python_version="3.11").apt_install("git")
         .run_commands(f"git clone https://github.com/Contrastive-LM/CLM.git /clm && git -C /clm checkout {COMMIT}",
                       "pip install vllm==0.11.0 'transformers>=4.56,<5' -e /clm huggingface_hub httpx==0.28.1"))
vol = modal.Volume.from_name("clm-data", create_if_missing=True, version=2)
app = modal.App("clm-stage-matrix")
PAIRS = [("Who wrote Romeo and Juliet?", "William Shakespeare"), ("What causes tides on Earth?", "The Moon's gravity"), ("What is the capital of Japan?", "Tokyo"),
         ("Which planet is the Red Planet?", "Mars"), ("What gas do plants absorb?", "Carbon dioxide"), ("What is the largest ocean?", "The Pacific Ocean"),
         ("Who developed general relativity?", "Albert Einstein"), ("Which organ pumps blood?", "The heart")]


@app.function(image=image, volumes={"/data": vol}, gpu="L40S", cpu=8, memory=48000, timeout=600)
def run():
    import requests, torch
    from clm import Engine
    from clm.heads import make_head
    log = open("/tmp/e.log", "w")
    e = subprocess.Popen("vllm serve /data/qwen3-8b --served-model-name qwen3-8b --runner pooling --max-model-len 2048 --port 8090 --gpu-memory-utilization 0.6", shell=True, stdout=log, stderr=log)
    t = time.time()
    while time.time() - t < 400:
        try:
            if requests.get("http://127.0.0.1:8090/v1/models", timeout=3).status_code == 200:
                break
        except Exception:
            pass
        time.sleep(2)
    torch.manual_seed(1234)
    kw = dict(width=1536, depth=3, proj=512, activation="gelu", layernorm=True, residual=False)
    torch.save({"state_head": make_head(**kw).state_dict(), "action_head": make_head(**kw).state_dict(), "logit_scale": torch.tensor(math.log(1 / 0.07)),
                "cfg": {"width": 1536, "depth": 3, "projection_dim": 512, "activation": "gelu", "layernorm": True, "residual": False}}, "/tmp/init.pt")
    out = {"labels": PAIRS, "stages": {}}
    for name, path in (("start", "/tmp/init.pt"), ("pre", "/data/runs/pre/best.pt"), ("mid", "/data/runs/mid/best.pt"), ("post", "/data/runs/post_neg3e4/best.pt")):
        eng = Engine(emb_url="http://127.0.0.1:8090/v1/embeddings", checkpoint=path, action_cache=0)
        crit = {str(i): a for i, (_, a) in enumerate(PAIRS)}
        M = []
        for q, _ in PAIRS:
            p = eng.answer(q, {"q": {"type": "choice", "instructions": None, "criteria": crit}})["answers"]["q"]["probabilities"]
            M.append([round(p[str(i)], 4) for i in range(len(PAIRS))])
        hit = sum(max(range(8), key=r.__getitem__) == i for i, r in enumerate(M))
        out["stages"][name] = {"m": M, "hits": hit}
        print("STAGE", name, hit, "of 8", flush=True)
    e.terminate()
    return out


@app.local_entrypoint()
def main(out: str = "matrix.json"):
    json.dump(run.remote(), open(out, "w"), separators=(",", ":"))
    print("saved")
