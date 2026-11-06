"""Run real heads over every state of the small browser games and save the model's probabilities.

The site replays these probabilities; nothing is invented or hand tuned. Accuracy is measured here and shown on the page.
    modal run game_scores.py --out ../site/scores.json
"""
import json
import os
import subprocess
import time

import modal

COMMIT = "d5f9ef0fd9bde185df0ceaad4f4ecc6cfe8c34f6"
image = (modal.Image.debian_slim(python_version="3.11").apt_install("git")
         .run_commands(f"git clone https://github.com/Contrastive-LM/CLM.git /clm && git -C /clm checkout {COMMIT}",
                       "pip install vllm==0.11.0 'transformers>=4.56,<5' -e /clm huggingface_hub httpx==0.28.1"))
vol = modal.Volume.from_name("clm-data", create_if_missing=True, version=2)
app = modal.App("clm-game-scores")

TRIVIA = [
    ("Who wrote the play Romeo and Juliet?", ["William Shakespeare", "Christopher Marlowe", "Charles Dickens", "Leo Tolstoy"], 0),
    ("What causes tides on Earth?", ["The Moon's gravitational pull", "Photosynthesis in plants", "The Earth's magnetic field", "Volcanic activity"], 0),
    ("What is the capital of Japan?", ["Seoul", "Tokyo", "Beijing", "Bangkok"], 1),
    ("Which planet is known as the Red Planet?", ["Venus", "Jupiter", "Mars", "Saturn"], 2),
    ("What gas do plants absorb from the air?", ["Oxygen", "Nitrogen", "Hydrogen", "Carbon dioxide"], 3),
    ("How many continents are there on Earth?", ["Five", "Six", "Seven", "Eight"], 2),
    ("What is the largest ocean on Earth?", ["Atlantic Ocean", "Pacific Ocean", "Indian Ocean", "Arctic Ocean"], 1),
    ("Who developed the theory of general relativity?", ["Isaac Newton", "Niels Bohr", "Albert Einstein", "Galileo Galilei"], 2),
    ("What is the chemical symbol for gold?", ["Ag", "Au", "Gd", "Go"], 1),
    ("Which organ pumps blood through the human body?", ["The liver", "The lungs", "The kidneys", "The heart"], 3),
]
TICKETS = [
    ("My invoice was charged twice this month.", "billing"), ("I need a refund for last month's payment.", "billing"),
    ("The app crashes every time I open it.", "technical"), ("I keep getting a 500 error when I log in.", "technical"),
    ("Can you tell me the price of the enterprise plan?", "sales"), ("I would like a demo of your product for my team.", "sales"),
    ("Please close my account, I no longer need it.", "cancel"), ("How do I cancel my subscription?", "cancel"),
]
ROUTES = {"billing": "Charges, invoices, refunds and payments", "technical": "Bugs, errors, crashes and outages",
          "sales": "Pricing, demos and new purchases", "cancel": "Closing an account or ending a subscription"}
LIGHTS = ["red", "green"]
CARS = ["A car is about to reach the crossing.", "The road is empty."]
CROSS = {"walk": "Walk across the road now.", "wait": "Wait at the curb."}
DIRS = {"north": "Go north.", "south": "Go south.", "east": "Go east.", "west": "Go west."}
N = 5


def bearing(dx, dy):
    parts = []
    if dy:
        parts.append(f"{abs(dy)} squares {'north' if dy < 0 else 'south'}")
    if dx:
        parts.append(f"{abs(dx)} squares {'west' if dx < 0 else 'east'}")
    return " and ".join(parts)


def grid_state(x, y, has_key):
    kx, ky, gx, gy = 3, 1, 4, 4
    if has_key:
        return f"Grid game. You have the key. The door is {bearing(gx - x, gy - y)} from you. Move toward the door."
    return f"Grid game. You need the key. The key is {bearing(kx - x, ky - y)} from you. Move toward the key."


def wait(url, proc, secs=900):
    import requests
    t = time.time()
    while time.time() - t < secs:
        try:
            if requests.get(url, timeout=3).status_code == 200:
                return
        except Exception:
            pass
        if proc.poll() is not None:
            raise RuntimeError("encoder died")
        time.sleep(2)
    raise TimeoutError(url)


@app.function(image=image, volumes={"/data": vol}, gpu="L40S", cpu=8, memory=48000, timeout=1200)
def score(heads):
    log = open("/tmp/e.log", "w")
    e = subprocess.Popen("vllm serve /data/qwen3-8b --served-model-name qwen3-8b --runner pooling --max-model-len 2048 --port 8090 --gpu-memory-utilization 0.6", shell=True, stdout=log, stderr=log)
    wait("http://127.0.0.1:8090/v1/models", e)
    from clm import Engine
    from clm.heads import download
    out = {}
    for name, path in heads.items():
        path = download() if path == "authors" else path
        eng = Engine(emb_url="http://127.0.0.1:8090/v1/embeddings", checkpoint=path, action_cache=0)

        def probs(state, instructions, criteria):
            q = {"q": {"type": "choice", "instructions": instructions, "criteria": criteria}}
            return eng.answer(state, q)["answers"]["q"]["probabilities"]

        res = {"trivia": [], "tickets": [], "crossing": [], "grid": {}}
        hit = 0
        for q, opts, gold in TRIVIA:
            p = probs(q, None, {str(i): o for i, o in enumerate(opts)})
            arr = [round(p[str(i)], 4) for i in range(len(opts))]
            res["trivia"].append(arr); hit += max(range(len(arr)), key=arr.__getitem__) == gold
        res["trivia_acc"] = hit / len(TRIVIA)
        hit = 0
        for t, gold in TICKETS:
            p = probs("Customer: " + t, "Which team should handle this?", ROUTES)
            res["tickets"].append({k: round(v, 4) for k, v in p.items()}); hit += max(p, key=p.get) == gold
        res["tickets_acc"] = hit / len(TICKETS)
        hit = 0
        for l in LIGHTS:
            for c in CARS:
                p = probs(f"You are a pedestrian at a road crossing. The traffic light for walkers is {l}. {c}", "What should you do?", CROSS)
                res["crossing"].append({"light": l, "car": c, "p": {k: round(v, 4) for k, v in p.items()}})
                good = "walk" if (l == "green" and "empty" in c) else "wait"
                hit += max(p, key=p.get) == good
        res["crossing_acc"] = hit / (len(LIGHTS) * len(CARS))
        for k in (0, 1):
            for x in range(N):
                for y in range(N):
                    if (x, y) in ((3, 1) if not k else (4, 4),):
                        continue
                    p = probs(grid_state(x, y, bool(k)), "Which way do you move?", DIRS)
                    res["grid"][f"{x},{y},{k}"] = {d: round(v, 4) for d, v in p.items()}
        # greedy rollouts from every start
        solved, steps = 0, []
        STEP = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}
        for sx in range(N):
            for sy in range(N):
                if (sx, sy) == (3, 1):
                    continue
                x, y, k, t = sx, sy, 0, 0
                while t < 40:
                    st = res["grid"].get(f"{x},{y},{k}")
                    d = max(st, key=st.get)
                    x, y = min(N - 1, max(0, x + STEP[d][0])), min(N - 1, max(0, y + STEP[d][1]))
                    t += 1
                    if not k and (x, y) == (3, 1):
                        k = 1
                    if k and (x, y) == (4, 4):
                        solved += 1; steps.append(t); break
        res["grid_solved"] = solved; res["grid_starts"] = N * N - 1
        out[name] = res
        print("SCORE", name, {k: res[k] for k in ("trivia_acc", "tickets_acc", "crossing_acc", "grid_solved", "grid_starts")}, flush=True)
    e.terminate()
    return {"heads": out, "trivia": TRIVIA, "tickets": TICKETS, "routes": ROUTES, "dirs": DIRS}


@app.local_entrypoint()
def main(out: str = "scores.json", heads: str = ""):
    H = dict(x.split("=") for x in heads.split(","))
    r = score.remote(H)
    json.dump(r, open(out, "w"))
    print("saved", out)
