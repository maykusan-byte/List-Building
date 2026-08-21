from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
files = sorted((ROOT / "pages").glob("page-*.png"))
thumb_w, thumb_h = 320, 180
cols = 4
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + 28)), "white")
draw = ImageDraw.Draw(sheet)
for index, path in enumerate(files):
    image = Image.open(path).convert("RGB")
    image.thumbnail((thumb_w, thumb_h))
    x = (index % cols) * thumb_w
    y = (index // cols) * (thumb_h + 28)
    sheet.paste(image, (x, y))
    draw.text((x + 6, y + thumb_h + 5), path.stem, fill="black")
sheet.save(ROOT / "contact-sheet.png", optimize=True)
print(ROOT / "contact-sheet.png")
