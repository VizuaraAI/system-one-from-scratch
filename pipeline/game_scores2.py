"""More small games, scored with our trained head. The site replays these real probabilities; win rates are measured here.
Topic Race is our own small link graph, in the spirit of WikiRacing. Tool Picker is in the spirit of tool calling. Block Drop is our own falling-block puzzle.

    modal run game_scores2.py --out ../site/scores2.json
"""
import json
import subprocess
import time

import modal

COMMIT = "d5f9ef0fd9bde185df0ceaad4f4ecc6cfe8c34f6"
image = (modal.Image.debian_slim(python_version="3.11").apt_install("git")
         .run_commands(f"git clone https://github.com/Contrastive-LM/CLM.git /clm && git -C /clm checkout {COMMIT}",
                       "pip install vllm==0.11.0 'transformers>=4.56,<5' -e /clm huggingface_hub httpx==0.28.1"))
vol = modal.Volume.from_name("clm-data", create_if_missing=True, version=2)
app = modal.App("clm-game-scores2")

G = {
    "Food": ["Italy", "Farming", "Chemistry", "India"], "Italy": ["Rome", "Food", "Europe", "Leonardo da Vinci"],
    "Rome": ["Julius Caesar", "Italy", "Architecture"], "Julius Caesar": ["Rome", "Calendar", "War"],
    "Farming": ["Food", "Climate", "Water"], "Climate": ["Ocean", "Atmosphere", "Farming"],
    "Ocean": ["Tides", "Whale", "Climate"], "Tides": ["Moon", "Ocean"], "Moon": ["Apollo 11", "Tides", "Solar System"],
    "Apollo 11": ["Neil Armstrong", "Moon", "NASA"], "Neil Armstrong": ["Apollo 11", "NASA"], "NASA": ["Apollo 11", "Solar System", "Computer"],
    "Solar System": ["Mars", "Moon", "Physics"], "Mars": ["Solar System", "NASA"], "Physics": ["Albert Einstein", "Solar System", "Chemistry", "Computer"],
    "Albert Einstein": ["Physics", "Germany"], "Germany": ["Europe", "Albert Einstein", "War"], "Europe": ["Germany", "Italy", "War"],
    "War": ["Julius Caesar", "Germany", "Europe"], "Chemistry": ["Physics", "Water", "Food"], "Water": ["Ocean", "Chemistry", "Farming"],
    "India": ["Food", "Mathematics", "Climate"], "Mathematics": ["Physics", "Computer", "India"], "Computer": ["Alan Turing", "Mathematics", "NASA", "Physics"],
    "Alan Turing": ["Computer", "Mathematics"], "Leonardo da Vinci": ["Italy", "Architecture", "Painting"], "Painting": ["Leonardo da Vinci", "Architecture"],
    "Architecture": ["Rome", "Painting", "Leonardo da Vinci"], "Whale": ["Ocean"], "Atmosphere": ["Climate", "Chemistry"], "Calendar": ["Julius Caesar", "Moon"],
}
RACES = [("Food", "Neil Armstrong"), ("Food", "Albert Einstein"), ("Water", "Alan Turing"), ("Rome", "Moon"), ("Whale", "Julius Caesar"),
         ("India", "Alan Turing"), ("Farming", "Apollo 11"), ("Painting", "Mars"), ("Climate", "Neil Armstrong"), ("Germany", "Painting")]
TOOLS = {"get_weather": "Get the current weather forecast for a city.", "send_email": "Send an email message to a person.",
         "search_flights": "Search for airline flights between two cities.", "convert_currency": "Convert an amount of money from one currency to another.",
         "create_calendar_event": "Add a meeting or event to the calendar.", "run_sql_query": "Run a SQL query against the company database.",
         "translate_text": "Translate text into another language.", "get_stock_price": "Get the latest price of a company's stock."}
ASKS = [("Will it rain in Mumbai tomorrow?", "get_weather"), ("Tell Priya that the report is ready, by mail.", "send_email"), ("Find me a way to fly from Delhi to Boston next week.", "search_flights"),
        ("How much is 500 dollars in rupees?", "convert_currency"), ("Set up a meeting with the team on Friday at 3 PM.", "create_calendar_event"),
        ("How many customers signed up last month? Check our tables.", "run_sql_query"), ("Say 'good morning' in Japanese.", "translate_text"), ("What is NVIDIA trading at right now?", "get_stock_price"),
        ("Is it hot in Dubai today?", "get_weather"), ("Book time on my schedule for the dentist.", "create_calendar_event")]
DROP = {"left": "Move the block one column to the left.", "right": "Move the block one column to the right.", "drop": "Drop the block straight down now."}
COLS = 7


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


@app.function(image=image, volumes={"/data": vol}, gpu="L40S", cpu=8, memory=48000, timeout=900)
def score(heads):
    log = open("/tmp/e.log", "w")
    e = subprocess.Popen("vllm serve /data/qwen3-8b --served-model-name qwen3-8b --runner pooling --max-model-len 2048 --port 8090 --gpu-memory-utilization 0.6", shell=True, stdout=log, stderr=log)
    wait("http://127.0.0.1:8090/v1/models", e)
    from clm import Engine
    out = {}
    for name, path in heads.items():
        eng = Engine(emb_url="http://127.0.0.1:8090/v1/embeddings", checkpoint=path, action_cache=0)
        P = lambda s, ins, c: eng.answer(s, {"q": {"type": "choice", "instructions": ins, "criteria": c}})["answers"]["q"]["probabilities"]
        r = {"race": {}, "tools": [], "drop": {}}
        goals = sorted({g for _, g in RACES})
        for g in goals:
            for n, links in G.items():
                if n != g:
                    p = P(f"Link race game. You are on the page \"{n}\". Your goal is to reach the page \"{g}\".", "Which link gets you closest to the goal?", {l: l for l in links})
                    r["race"][f"{n}|{g}"] = {k: round(v, 4) for k, v in p.items()}
        wins = []
        for s, g in RACES:
            cur, seen, path = s, {s}, [s]
            for _ in range(8):
                if cur == g:
                    break
                opts = r["race"][f"{cur}|{g}"]
                order = sorted(opts, key=opts.get, reverse=True)
                nxt = next((o for o in order if o not in seen), order[0])
                cur = nxt; seen.add(cur); path.append(cur)
            wins.append({"start": s, "goal": g, "path": path, "won": cur == g})
        r["race_runs"] = wins; r["race_won"] = sum(w["won"] for w in wins); r["race_total"] = len(wins)
        hit = 0
        for a, gold in ASKS:
            p = P("User request: " + a, "Which tool should the agent call?", TOOLS)
            r["tools"].append({k: round(v, 4) for k, v in p.items()}); hit += max(p, key=p.get) == gold
        r["tools_acc"] = hit / len(ASKS)
        for block in range(COLS):
            for gap in range(COLS):
                where = "directly below your block" if gap == block else (f"{abs(gap-block)} columns to the {'right' if gap > block else 'left'} of your block")
                p = P(f"Falling block puzzle. Your block is above column {block+1}. The only gap in the floor is {where}.", "What should you do to land the block in the gap?", DROP)
                r["drop"][f"{block},{gap}"] = {k: round(v, 4) for k, v in p.items()}
        ok = 0
        for gap in range(COLS):
            for start in range(COLS):
                b, t = start, 0
                while t < 12:
                    st = r["drop"][f"{b},{gap}"]; d = max(st, key=st.get); t += 1
                    if d == "drop":
                        ok += b == gap; break
                    b = max(0, b - 1) if d == "left" else min(COLS - 1, b + 1)
        r["drop_won"] = ok; r["drop_total"] = COLS * COLS
        out[name] = r
        print("SCORE", name, {k: r[k] for k in ("race_won", "race_total", "tools_acc", "drop_won", "drop_total")}, [("+" if w["won"] else "-") + "/".join(w["path"]) for w in wins][:4], flush=True)
    e.terminate()
    return {"heads": out, "graph": G, "races": RACES, "tools": TOOLS, "asks": ASKS, "drop": DROP, "cols": COLS}


@app.local_entrypoint()
def main(out: str = "scores2.json", heads: str = ""):
    json.dump(score.remote(dict(x.split("=") for x in heads.split(","))), open(out, "w"), separators=(",", ":"))
    print("saved")
