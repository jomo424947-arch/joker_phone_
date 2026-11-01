import os
from PIL import Image

src_img_path = r'C:/Users/jomo4/.gemini/antigravity/brain/64d27ca3-7156-4932-be1d-8b3137e12ed6/.user_uploaded/media_1793519758274_5f0c8cba.jpg'
base_dir = r'C:\Users\jomo4\OneDrive\Desktop\Joker Store'

img = Image.open(src_img_path).convert('RGB')
w, h = img.size # 1024, 682

# Let's inspect the plaque area:
# The plaque has the phone icon on the left, "Mobix" in the middle, and "- شريكك الذكي لإدارة محلات الموبايلات -" below.
# The card itself spans roughly: x from 80 to 940, y from 160 to 560.
# If we create a square canvas of size 960x960:
# The background color is approximately (14, 16, 20)
bg_color = (13, 16, 23)

# Let's create two versions:
# Version A: Full aesthetic card on square canvas 1024x1024 (great for logo.png)
canvas = Image.new('RGB', (w, w), bg_color)
# Paste original in the vertical center:
paste_y = (w - h) // 2
canvas.paste(img, (0, paste_y))

# Also smooth top and bottom edges if any difference with bg_color:
# Let's sample top strip and bottom strip of img to blend:
canvas_512 = canvas.resize((512, 512), Image.Resampling.LANCZOS)

# Version B: Tighter crop for icons (so the icon at 32x32 or 48x48 looks punchy and prominent)
# Crop around the card: x from 75 to 945 (width 870), y from 140 to 580 (height 440)
# Center on square 870x870:
card_w = 890
card_h = 470
cx = (75 + 945) // 2
cy = (140 + 580) // 2

crop_size = 920
crop_x1 = max(0, cx - crop_size // 2)
crop_y1 = max(0, cy - crop_size // 2)
crop_x2 = min(w, crop_x1 + crop_size)
crop_y2 = min(h, crop_y1 + crop_size)

icon_canvas = Image.new('RGB', (crop_size, crop_size), bg_color)
crop_part = img.crop((crop_x1, max(0, crop_y1), crop_x2, min(h, crop_y2)))
icon_canvas.paste(crop_part, (0, (crop_size - crop_part.height) // 2))

icon_512 = icon_canvas.resize((512, 512), Image.Resampling.LANCZOS)

# Targets for PNGs:
png_targets = [
    os.path.join(base_dir, 'src', 'renderer', 'assets', 'logo.png'),
    os.path.join(base_dir, 'src', 'renderer', 'public', 'logo.png'),
    os.path.join(base_dir, 'public', 'logo.png'),
    os.path.join(base_dir, 'build', 'icon.png'),
    os.path.join(base_dir, 'src', 'renderer', 'assets', 'mobix-logo.png'),
]

for target in png_targets:
    os.makedirs(os.path.dirname(target), exist_ok=True)
    canvas_512.save(target, 'PNG', quality=95)
    print(f"Saved PNG to {target}")

# Save mobix-logo.jpg as master asset
master_jpg = os.path.join(base_dir, 'src', 'renderer', 'assets', 'mobix-logo.jpg')
img.save(master_jpg, 'JPEG', quality=95)
print(f"Saved Master JPG to {master_jpg}")

# Save Multi-resolution ICOs
ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
ico_targets = [
    os.path.join(base_dir, 'build', 'icon.ico'),
    os.path.join(base_dir, 'build', 'installerIcon.ico'),
    os.path.join(base_dir, 'build', 'uninstallerIcon.ico'),
    os.path.join(base_dir, 'public', 'icon.ico'),
    os.path.join(base_dir, 'src', 'renderer', 'public', 'icon.ico'),
    os.path.join(base_dir, 'src', 'renderer', 'public', 'favicon.ico'),
]

for target in ico_targets:
    os.makedirs(os.path.dirname(target), exist_ok=True)
    canvas.save(target, format='ICO', sizes=ico_sizes)
    print(f"Saved ICO to {target}")

with open(os.path.join(base_dir, 'scripts', 'assets_generated.log'), 'w', encoding='utf-8') as lf:
    lf.write("Mobix assets successfully generated.\n")

