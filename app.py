#!/usr/bin/env python3
"""
ShortMaker — Local web uygulaması
Çalıştırmak için:
    pip install fastapi uvicorn python-multipart
    python app.py
Sonra tarayıcıda: http://localhost:8000
"""

import json
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory="."), name="static")


def parse_time(t: str) -> float:
    t = t.strip()
    if ":" in t:
        parts = [float(p) for p in t.split(":")]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        elif len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return float(t)


def run_ffmpeg(input_path: Path, output_path: Path, start_sec: float, duration: float):
    # 16:9 → 9:16 pillarbox (üst/alta siyah bant)
    # Hedef: 1080x1920 (tam 9:16 dikey)
    # 1. scale: videoyu 1080 genişliğe, orantılı yüksekliğe küçült (1080x607)
    # 2. pad: 1920 yüksekliğe tamamla, videoyu ortaya yerleştir
    vf = "scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", str(input_path),
        "-t", str(duration),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        str(output_path),
    ]
    return subprocess.run(cmd, stderr=subprocess.PIPE, text=True)


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/outputs")
async def list_outputs():
    files = sorted(OUTPUT_DIR.glob("*_short*"), key=lambda f: f.stat().st_mtime, reverse=True)
    result = []
    for f in files:
        result.append({
            "file_id": f.name,
            "size_mb": round(f.stat().st_size / (1024 * 1024), 1),
        })
    return {"files": result}


@app.post("/process-multiple")
async def process_multiple(
    video: UploadFile = File(...),
    ranges: str = Form(...),  # JSON string: [{"start":"00:00:10","end":"00:00:30"}, ...]
):
    try:
        range_list = json.loads(ranges)
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz ranges formatı.")

    if not range_list:
        raise HTTPException(status_code=400, detail="En az bir aralık gerekli.")

    # Videoyu bir kere kaydet
    ext = Path(video.filename).suffix or ".mp4"
    uid = uuid.uuid4().hex[:8]
    input_path = UPLOAD_DIR / f"{uid}_input{ext}"

    with open(input_path, "wb") as f:
        f.write(await video.read())

    results = []
    for i, r in enumerate(range_list):
        try:
            start_sec = parse_time(r["start"])
            end_sec   = parse_time(r["end"])
        except (KeyError, ValueError):
            results.append({"index": i, "error": "Geçersiz zaman formatı."})
            continue

        duration = end_sec - start_sec
        if duration <= 0:
            results.append({"index": i, "error": "Bitiş başlangıçtan büyük olmalı."})
            continue

        file_id = f"{uid}_short{i+1}{ext}"
        output_path = OUTPUT_DIR / file_id

        result = run_ffmpeg(input_path, output_path, start_sec, duration)

        if result.returncode != 0:
            results.append({"index": i, "error": result.stderr[-500:]})
        else:
            size_mb = round(output_path.stat().st_size / (1024 * 1024), 1)
            results.append({"index": i, "file_id": file_id, "size_mb": size_mb})

    input_path.unlink(missing_ok=True)
    return {"results": results}


@app.get("/preview/{file_id}")
async def preview(file_id: str):
    if "/" in file_id or "\\" in file_id or ".." in file_id:
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")
    path = OUTPUT_DIR / file_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")
    return FileResponse(path, media_type="video/mp4")


@app.get("/download/{file_id}")
async def download(file_id: str):
    if "/" in file_id or "\\" in file_id or ".." in file_id:
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")
    path = OUTPUT_DIR / file_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")
    return FileResponse(path, media_type="video/mp4", filename=file_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)