"""Draw the app's geometric W/grid mark (Pillow), without external images."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
image = Image.new("RGB", (1024, 1024), "#174c3c")
draw = ImageDraw.Draw(image)
for coordinate in range(128, 1024, 128):
    draw.line((coordinate, 0, coordinate, 1024), fill="#2c5b4c", width=3)
    draw.line((0, coordinate, 1024, coordinate), fill="#2c5b4c", width=3)
draw.line([(200, 310), (310, 730), (490, 420), (650, 730), (780, 310)], fill="#faf8ee", width=65, joint="curve")
draw.line((775, 160, 775, 280), fill="#dfb268", width=25)
draw.line((715, 220, 835, 220), fill="#dfb268", width=25)
(root / "build").mkdir(exist_ok=True)
image.save(root / "build/icon.ico", sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])
image.resize((256,256), Image.Resampling.LANCZOS).save(root / "build/icon.png")
resources = root / "android/app/src/main/res"
for density, size in [("mdpi",48), ("hdpi",72), ("xhdpi",96), ("xxhdpi",144), ("xxxhdpi",192)]:
    folder = resources / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    for name in ["ic_launcher.png", "ic_launcher_round.png"]:
        image.resize((size,size), Image.Resampling.LANCZOS).save(folder / name)
    # Adaptive icon foreground: keep the mark inside Android's safe circle.
    foreground = Image.new("RGBA", (432,432), (0,0,0,0))
    mark = image.resize((250,250), Image.Resampling.LANCZOS)
    foreground.paste(mark, (91,91))
    foreground.resize((size*108//48,size*108//48), Image.Resampling.LANCZOS).save(folder / "ic_launcher_foreground.png")
