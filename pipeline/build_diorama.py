#!/usr/bin/env python3
"""
Multi-Scene 2.5D Lo-Fi Diorama Pipeline
---------------------------------------
Runs Depth-Anything-V2-Large once on Apple Silicon MPS across all configured
scenes, producing per-scene:
  - Guided-filtered depth_map.png
  - 5 depth-sliced, 12px edge-bled, OpenCV-inpainted RGBA cards
  - Packed RGB semantic stencils (mask_env.png, mask_glow.png)
  - manifest.json + root scenes.json catalog
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from scipy.ndimage import distance_transform_edt
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets" / "source"
OUT_ROOT = ROOT / "public" / "assets"
SCENES_OUT = OUT_ROOT / "scenes"
MODEL_ID = "depth-anything/Depth-Anything-V2-Large-hf"

SCENES = [
    {
        "id": "teahouse",
        "source": "teahouse_dusk.jpg",
        "title": "Mountain Teahouse at Dusk",
        "nativeTitle": "山茶屋 · 黄昏",
        "region": "Japan",
        "badge": "Japan · Dusk",
        "subtitle": "Move cursor for parallax · Click lantern, pond, or tea",
        "soundProfile": "japan",
        "customThresholds": [0.03, 0.11, 0.34, 0.62],
        "effects": {
            "rain": 0.0,
            "fog": 0.0,
            "clouds": 0.0,
            "mist": 0.22,
            "fireflies": True,
            "stars": True,
            "pendulumLantern": True,
            "mistColor": "0x9cb4d4",
            "cloudColor": "0xa8b8d8",
        },
        "anchors": {
            "hangingLanternPivot": [0.256, 0.088],
            "hangingLanternCenter": [0.256, 0.245],
            "stoneLanternCenter": [0.340, 0.558],
            "teacupSteam": [0.404, 0.818],
            "teapotSpout": [0.438, 0.800],
            "pondCenter": [0.690, 0.720],
            "moonCenter": [0.790, 0.150],
        },
        "regions": {
            "water": [0.50, 0.90, 0.55, 0.88],
            "skyMaxV": 0.42,
            "lantern1": [0.216, 0.298, 0.105, 0.375],
            "lantern2": [0.30, 0.38, 0.51, 0.61],
            "mistBand": [0.36, 0.98, 0.38, 0.66],
        },
    },
    {
        "id": "moonlit-cottage",
        "source": "moonlit_cottage.png",
        "title": "Moonlit Mountain Cottage",
        "nativeTitle": "Above the Clouds",
        "region": "Mountain Retreat",
        "badge": "Mountain Cottage · Drizzle",
        "subtitle": "Gentle rain above the clouds · Click the lanterns or coffee",
        "soundProfile": "america_pnw",
        "customThresholds": [0.018, 0.16, 0.48, 0.69],
        "effects": {
            "rain": 0.22,
            "fog": 0.25,
            "clouds": 0.0,
            "mist": 0.30,
            "fireflies": False,
            "stars": False,
            "pendulumLantern": False,
            "potSteam": False,
            "cupSteam": {"size": [0.055, 0.145], "opacity": 0.65},
            "mistColor": "0x91acd1",
        },
        "anchors": {
            "hangingLanternPivot": [0.183, 0.035],
            "hangingLanternCenter": [0.187, 0.167],
            "stoneLanternCenter": [0.608, 0.811],
            "teacupSteam": [0.467, 0.781],
            "teapotSpout": [0.467, 0.784],
            "pondCenter": [0.0, 0.0],
            "moonCenter": [0.893, 0.110],
        },
        "regions": {
            "water": [0.0, 0.0, 0.0, 0.0],
            "skyMaxV": 0.32,
            "lantern1": [0.151, 0.225, 0.102, 0.225],
            "lantern2": [0.577, 0.639, 0.754, 0.863],
            "mistBand": [0.22, 0.99, 0.32, 0.57],
        },
    },
    {
        "id": "pnw",
        "source": "pnw_cabin_dawn.jpg",
        "title": "Olympic Cedar Cabin",
        "nativeTitle": "Pacific Northwest · Dawn",
        "region": "America",
        "badge": "America · Foggy Dawn",
        "subtitle": "Forest fog & dawn drizzle · Click banker's lamp, lake, or coffee",
        "soundProfile": "america_pnw",
        "customThresholds": [0.03, 0.11, 0.24, 0.50],
        "effects": {
            "rain": 0.34,
            "fog": 0.82,
            "clouds": 0.52,
            "mist": 0.34,
            "fireflies": False,
            "stars": False,
            "pendulumLantern": False,
            "mistColor": "0xc6d5e0",
            "cloudColor": "0xf0d2c4",
        },
        "anchors": {
            "hangingLanternPivot": [0.205, 0.565],
            "hangingLanternCenter": [0.205, 0.565],
            "stoneLanternCenter": [0.205, 0.565],
            "teacupSteam": [0.431, 0.768],
            "teapotSpout": [0.431, 0.768],
            "pondCenter": [0.575, 0.495],
            "moonCenter": [0.560, 0.240],
        },
        "regions": {
            "water": [0.46, 0.70, 0.42, 0.59],
            "skyMaxV": 0.38,
            "lantern1": [0.11, 0.29, 0.48, 0.72],
            "lantern2": [0.11, 0.29, 0.48, 0.72],
            "mistBand": [0.24, 0.88, 0.46, 0.75],
        },
    },
    {
        "id": "darjeeling",
        "source": "darjeeling_dawn_cel.png",
        "title": "Darjeeling Cloud Bungalow",
        "nativeTitle": "दार्जिलिंग · भोर",
        "region": "India",
        "badge": "Himalayas · Dawn Clouds",
        "subtitle": "Drifting dawn clouds · Click the lanterns or tea",
        "soundProfile": "india_himalaya",
        "effects": {
            "rain": 0.0,
            "fog": 0.0,
            "clouds": 0.0,
            "mist": 0.0,
            "cloudDrift": 0.016,
            "fireflies": False,
            "stars": False,
            "pendulumLantern": False,
            "potSteam": False,
            "cupSteam": {"size": [0.05, 0.135], "opacity": 0.60},
            "depthRelief": 0.018,
            "parallaxStrength": 0.58,
            "lanternHalo": 0.35,
            "sourceColor": True,
        },
        "anchors": {
            "hangingLanternPivot": [0.073, 0.067],
            "hangingLanternCenter": [0.073, 0.231],
            "stoneLanternCenter": [0.119, 0.878],
            "teacupSteam": [0.335, 0.876],
            "teapotSpout": [0.276, 0.824],
            "pondCenter": [0.700, 0.560],
            "moonCenter": [0.119, 0.402],
        },
        "regions": {
            "water": [0.0, 0.0, 0.0, 0.0],
            "skyMaxV": 0.38,
            "lantern1": [0.050, 0.095, 0.15, 0.275],
            "lantern2": [0.084, 0.155, 0.75, 0.95],
            "mistBand": [0.26, 1.0, 0.43, 0.80],
            "cloudBanks": [
                [[0.26, 0.459], [0.35, 0.456], [0.42, 0.452], [0.36, 0.487],
                 [0.30, 0.485]],
                [[0.40, 0.500], [0.50, 0.489], [0.58, 0.467], [0.69, 0.470],
                 [0.77, 0.466], [0.90, 0.443], [1.00, 0.435], [1.00, 0.475],
                 [0.89, 0.482], [0.80, 0.506], [0.72, 0.550], [0.62, 0.548],
                 [0.49, 0.554], [0.42, 0.539]],
                [[0.30, 0.547], [0.40, 0.554], [0.51, 0.551], [0.60, 0.535],
                 [0.69, 0.554], [0.76, 0.582], [0.82, 0.583], [0.90, 0.547],
                 [1.00, 0.559], [1.00, 0.731], [0.92, 0.743], [0.84, 0.785],
                 [0.77, 0.771], [0.71, 0.738], [0.63, 0.721], [0.54, 0.693],
                 [0.46, 0.665], [0.39, 0.635], [0.34, 0.596]],
            ],
        },
    },
    {
        "id": "kerala",
        "source": "kerala_monsoon_cel.png",
        "title": "Kerala Monsoon Veranda",
        "nativeTitle": "കേരളം · മഴക്കാലം",
        "region": "India",
        "badge": "India · Rainy Night",
        "subtitle": "Monsoon on the backwaters · Click the lamp, water, or coffee",
        "soundProfile": "india_monsoon",
        "effects": {
            "rain": 0.52,
            "rainRenderOrder": 3,
            "fog": 0.0,
            "clouds": 0.0,
            "mist": 0.0,
            "fireflies": False,
            "stars": False,
            "pendulumLantern": False,
            "sourceColor": True,
            "naturalWater": True,
            "parallaxStrength": 0.48,
            "depthRelief": 0.018,
            "lanternHalo": 0.33,
            "secondaryGlow": False,
            "cupSteam": {"size": [0.051, 0.145], "opacity": 0.70},
            "potSteam": {"size": [0.040, 0.123], "opacity": 0.60},
        },
        "anchors": {
            "hangingLanternPivot": [0.090, 0.087],
            "hangingLanternCenter": [0.134, 0.176],
            "stoneLanternCenter": [0.0, 0.0],
            "teacupSteam": [0.305, 0.774],
            "teapotSpout": [0.140, 0.730],
            "pondCenter": [0.478, 0.669],
            "moonCenter": [0.58, 0.24],
        },
        "regions": {
            "water": [0.17, 0.60, 0.516, 0.810],
            "waterOutline": [[0.168, 0.518], [0.997, 0.517], [0.998, 0.872],
                             [0.425, 0.875], [0.420, 0.811], [0.169, 0.809]],
            "skyMaxV": 0.42,
            "lantern1": [0.099, 0.169, 0.119, 0.208],
            "lantern2": [0.0, 0.0, 0.0, 0.0],
            "mistBand": [0.23, 0.96, 0.45, 0.59],
        },
    },
    {
        "id": "summer-terrace",
        "source": "indian_summer_terrace.png",
        "title": "Summer Night on the Terrace",
        "nativeTitle": "A Rooftop Sleepover",
        "region": "India",
        "badge": "India · Terrace",
        "subtitle": "A rooftop sleepover under the summer stars",
        "soundProfile": "india_summer",
        "effects": {
            "sourceColor": True,
            "stars": True,
            "moonGlow": 0.014,
            "terraceInteractions": True,
            "torchProp": {
                "file": "assets/scenes/summer-terrace/torch.png",
                "center": [0.357, 0.749],
                "size": [0.040, 0.033],
            },
            "starLuma": [0.08, 0.40],
            "mist": 0.0,
            "cupSteam": False,
            "potSteam": False,
            "secondaryGlow": False,
            "parallaxStrength": 0.42,
            "depthRelief": 0.012,
            "lanternHalo": 0.085,
            "sleeperBreath": [[0.453, 0.716, 0.038, 0.042], [0.584, 0.665, 0.037, 0.036]],
            "awakeGestures": {
                "chuckle": [0.362, 0.619, 0.0062, 0.014],
                "point": [0.471, 0.481, 0.036, 0.071],
                "feet": [0.685, 0.586, 0.036, 0.050],
            },
            "foliageSway": 0.0054,
            "foliageSpeed": 0.58,
        },
        "anchors": {
            "hangingLanternPivot": [0.121, 0.380],
            "hangingLanternCenter": [0.120, 0.397],
            "stoneLanternCenter": [0.0, 0.0],
            "teacupSteam": [0.0, 0.0],
            "teapotSpout": [0.0, 0.0],
            "pondCenter": [0.0, 0.0],
            "moonCenter": [0.808, 0.127],
        },
        "regions": {
            "water": [0.0, 0.0, 0.0, 0.0],
            "skyMaxV": 0.37,
            "lantern1": [0.113, 0.127, 0.383, 0.407],
            "lanternHaloRadii": [0.013, 0.027],
            "lantern2": [0.0, 0.0, 0.0, 0.0],
            "mistBand": [0.2, 0.8, 0.35, 0.45],
            "foliageZones": [
                [0.049, 0.633, 0.031, 0.039],
                [0.181, 0.500, 0.037, 0.068],
                [0.221, 0.540, 0.023, 0.032],
                [0.802, 0.503, 0.036, 0.058],
                [0.832, 0.561, 0.014, 0.037],
                [0.953, 0.629, 0.041, 0.058],
            ],
        },
    },
]


def guided_filter(guide: np.ndarray, src: np.ndarray, radius: int = 10, eps: float = 2e-3) -> np.ndarray:
    ksize = (2 * radius + 1, 2 * radius + 1)
    mean_i = cv2.boxFilter(guide, cv2.CV_32F, ksize)
    mean_p = cv2.boxFilter(src, cv2.CV_32F, ksize)
    corr_i = cv2.boxFilter(guide * guide, cv2.CV_32F, ksize)
    corr_ip = cv2.boxFilter(guide * src, cv2.CV_32F, ksize)
    var_i = corr_i - mean_i * mean_i
    cov_ip = corr_ip - mean_i * mean_p
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    mean_a = cv2.boxFilter(a, cv2.CV_32F, ksize)
    mean_b = cv2.boxFilter(b, cv2.CV_32F, ksize)
    return np.clip(mean_a * guide + mean_b, 0.0, 1.0)


def estimate_depth(pil_img: Image.Image, processor, model, device: str) -> np.ndarray:
    inputs = processor(images=pil_img, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model(**inputs)
        predicted = outputs.predicted_depth

    w, h = pil_img.size
    depth = (
        torch.nn.functional.interpolate(
            predicted.unsqueeze(1),
            size=(h, w),
            mode="bicubic",
            align_corners=False,
        )
        .squeeze()
        .cpu()
        .numpy()
    )
    d_min, d_max = np.percentile(depth, 1), np.percentile(depth, 99.5)
    depth_norm = np.clip((depth - d_min) / max(d_max - d_min, 1e-6), 0.0, 1.0).astype(np.float32)

    rgb = np.array(pil_img, dtype=np.float32) / 255.0
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    return guided_filter(luma, depth_norm, radius=10, eps=2e-3)


def dilate_rgb_bleed(rgb: np.ndarray, alpha_mask: np.ndarray, bleed_px: int = 12) -> np.ndarray:
    opaque = alpha_mask > 0.05
    if opaque.all() or not opaque.any():
        return rgb.copy()
    dist, indices = distance_transform_edt(~opaque, return_indices=True)
    bled = rgb.copy()
    fill_zone = (~opaque) & (dist <= bleed_px)
    bled[fill_zone] = rgb[indices[0][fill_zone], indices[1][fill_zone]]
    return bled


def inpaint_occluded(bgr: np.ndarray, occluder_mask_u8: np.ndarray) -> np.ndarray:
    if not np.any(occluder_mask_u8 > 0):
        return bgr.copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    dilated = cv2.dilate(occluder_mask_u8, kernel, iterations=1)
    h, w = bgr.shape[:2]
    small_bgr = cv2.resize(bgr, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize(dilated, (w // 2, h // 2), interpolation=cv2.INTER_NEAREST)
    inpainted_small = cv2.inpaint(small_bgr, small_mask, inpaintRadius=11, flags=cv2.INPAINT_TELEA)
    inpainted_small = cv2.bilateralFilter(inpainted_small, d=7, sigmaColor=25, sigmaSpace=25)
    inpainted_full = cv2.resize(inpainted_small, (w, h), interpolation=cv2.INTER_CUBIC)
    feather = cv2.GaussianBlur(dilated.astype(np.float32) / 255.0, (15, 15), 0)[..., None]
    result = bgr.astype(np.float32) * (1.0 - feather) + inpainted_full.astype(np.float32) * feather
    return np.clip(result, 0, 255).astype(np.uint8)


def soft_mask(binary: np.ndarray, close_r: int = 7, blur_k: int = 7) -> np.ndarray:
    u8 = (binary.astype(np.uint8)) * 255
    if close_r > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_r, close_r))
        u8 = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, k)
        u8 = cv2.morphologyEx(u8, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    if blur_k > 0:
        u8 = cv2.GaussianBlur(u8, (blur_k, blur_k), 0)
    return u8.astype(np.float32) / 255.0


def polygon_mask(shape: tuple[int, int], polygons: list) -> np.ndarray:
    h, w = shape
    mask = np.zeros(shape, dtype=np.uint8)
    for polygon in polygons:
        points = np.round(np.asarray(polygon) * [w - 1, h - 1]).astype(np.int32)
        cv2.fillPoly(mask, [points], 1)
    return mask


def summer_terrace_layer_masks(depth: np.ndarray, u: np.ndarray, v: np.ndarray) -> tuple:
    # Hold both quilts, their occupants, and the bottle on the same card.
    bedding = [
        [(395, 741), (403, 709), (420, 682), (444, 666), (508, 656),
         (628, 642), (795, 635), (961, 633), (1117, 630), (1206, 631),
         (1244, 648), (1269, 668), (1300, 694), (1322, 723), (1324, 738),
         (1307, 748), (961, 757), (672, 759), (454, 754)],
        [(363, 738), (362, 687), (366, 679), (365, 667), (370, 663),
         (380, 664), (383, 670), (383, 680), (388, 689), (386, 737), (377, 741)],
    ]
    bedding = [np.asarray(path) / [1671, 940] for path in bedding]
    quilts = polygon_mask(depth.shape, bedding) > 0
    cousins = ((u > 0.235) & (u < 0.744) & (v > 0.48) & (v < 0.700)
               & (depth > 0.325 + 2.0 * np.maximum(v - 0.602, 0.0)))
    pointing_arm = ((u > 0.432) & (u < 0.490) & (v > 0.448) & (v < 0.555)
                    & (depth > np.where(v < 0.485, 0.095, 0.32)))
    foreground = quilts | cousins | pointing_arm

    stairwell = (u < 0.154) & (depth > 0.145) & ~foreground
    parapet_top = 0.488 + 0.49 * np.maximum(u - 0.847, 0.0)
    plants_above_wall = (((u > 0.147) & (u < 0.217)) | ((u > 0.762) & (u < 0.837)))
    terrace = (v > parapet_top) | (plants_above_wall & (v > 0.428) & (depth > 0.095))
    terrace &= ~foreground & ~stairwell
    skyline = (v > 0.366) & (depth > 0.009) & ~foreground & ~stairwell & ~terrace
    return skyline, terrace, stairwell, foreground


def kerala_layer_masks(depth: np.ndarray, u: np.ndarray, v: np.ndarray) -> tuple:
    tabletop = [[0.0, 0.832], [0.072, 0.818], [0.434, 0.819], [0.437, 0.830],
                [0.437, 0.846], [0.361, 0.936], [0.337, 0.964], [0.0, 0.964]]
    table_legs = [
        [[0.084, 0.956], [0.111, 0.956], [0.111, 1.0], [0.084, 1.0]],
        [[0.146, 0.956], [0.171, 0.956], [0.171, 1.0], [0.146, 1.0]],
        [[0.298, 0.929], [0.346, 0.929], [0.346, 1.0], [0.298, 1.0]],
        [[0.383, 0.901], [0.417, 0.869], [0.413, 1.0], [0.383, 1.0]],
    ]
    table = polygon_mask(depth.shape, [tabletop, *table_legs]) > 0
    kettle = [[0.131, 0.726], [0.165, 0.717], [0.167, 0.631], [0.260, 0.631],
              [0.261, 0.829], [0.159, 0.828], [0.147, 0.766]]
    mug = [[0.280, 0.761], [0.349, 0.761], [0.348, 0.828], [0.280, 0.828]]
    vessels = polygon_mask(depth.shape, [kettle, mug]) > 0
    table |= vessels & (depth > 0.30)
    front_post = (u < 0.080) & (depth > 0.67)
    foreground = table | front_post

    # The seated figures and the deck share a plane to keep the silhouettes
    # and their contact shadows together during the camera drift.
    deck = (v > 0.880 + 0.018 * (u - 0.42)) | ((u < 0.166) & (v > 0.806))
    family = (u > 0.594) & (v > 0.24) & (depth > 0.205 + 0.10 * v)
    seated = (deck | family) & ~foreground
    roof_and_wall = ((v < 0.147) & (depth > 0.11)) | ((u < 0.163) & (v < 0.82))
    shelter = roof_and_wall & ~foreground & ~seated
    leaves = (u > 0.160) & (u < 0.318) & (v > 0.11) & (v < 0.36) & (depth > 0.068)
    leaves &= ~foreground & ~seated & ~shelter
    return leaves, shelter, seated, foreground


def darjeeling_layer_masks(depth: np.ndarray, u: np.ndarray, v: np.ndarray) -> tuple:
    # Trace the table and tea service as one plane so their rims and shadows
    # stay together where the model predicts similar depths for the rail.
    polygons = [
        [(0, 854), (75, 844), (143, 839), (270, 834), (415, 834),
         (540, 837), (630, 845), (713, 858), (763, 872), (789, 884),
         (801, 897), (800, 921), (788, 933), (770, 940), (0, 940)],
        [(143, 777), (143, 770), (159, 752), (177, 741), (176, 734),
         (191, 728), (188, 716), (194, 705), (203, 705), (211, 716),
         (208, 726), (224, 733), (223, 742), (239, 751), (259, 771),
         (253, 779), (248, 835), (145, 851)],
        [(265, 805), (262, 791), (270, 775), (284, 766), (299, 767),
         (310, 777), (324, 756), (352, 747), (351, 739), (359, 733),
         (369, 735), (376, 745), (395, 752), (408, 765), (421, 789),
         (434, 772), (451, 763), (462, 763), (470, 772), (459, 780),
         (449, 808), (435, 837), (421, 853), (301, 849), (277, 826)],
        [(506, 825), (511, 816), (528, 809), (551, 806), (575, 806),
         (598, 812), (612, 823), (625, 820), (635, 825), (638, 837),
         (632, 850), (619, 861), (513, 865)],
    ]
    normalised = [np.asarray(poly) / [1671, 940] for poly in polygons]
    table = polygon_mask(depth.shape, normalised).astype(bool)
    wood = (depth > 0.34) & ~table
    eaves = wood & ((v < 0.30) | (u < 0.036))
    rail = wood & ~eaves
    terraces = (depth > 0.068) & (v > 0.41) & ~wood & ~table
    return terraces, rail, eaves, table


def build_semantic_masks(rgb: np.ndarray, depth: np.ndarray, cfg: dict) -> tuple[np.ndarray, np.ndarray]:
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w
    v = yy / h

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1] / 255.0
    val = hsv[:, :, 2] / 255.0

    reg = cfg["regions"]

    # 1. Water mask (R of env)
    wx0, wx1, wy0, wy1 = reg["water"]
    if "waterOutline" in reg:
        outline = polygon_mask((h, w), [reg["waterOutline"]])
        water = soft_mask((outline > 0) & (depth < 0.335), close_r=7, blur_k=17)
    elif wx1 > wx0:
        water_roi = (u > wx0) & (u < wx1) & (v > wy0) & (v < wy1) & (depth < 0.45)
        water_color = (val > 0.24) & (hue > 75) & (hue < 145)
        if cfg["id"] == "pnw":
            water_color = (val > 0.56) & (sat < 0.35)
        water = soft_mask(water_roi & water_color, close_r=9, blur_k=9)
    else:
        water = np.zeros((h, w), dtype=np.float32)

    # 2. Sky mask (G of env)
    sky_max_v = reg["skyMaxV"]
    sky_raw = (depth < 0.16) & (v < sky_max_v)
    if cfg["id"] in ("teahouse", "pnw", "darjeeling"):
        sky_raw = sky_raw & ((val > 0.36) | (v < sky_max_v * 0.55))
    sky = soft_mask(sky_raw, close_r=11, blur_k=11)

    # 3. Foliage / prayer flags sway mask (B of env)
    green_tint = (hue >= 30) & (hue <= 104) & (sat > 0.14) & (val > 0.05) & (val < 0.72)
    mid_depth = (depth > 0.06) & (depth < 0.65)
    foliage_raw = green_tint & mid_depth
    lx0, lx1, ly0, ly1 = reg["lantern1"]
    lantern_excl = (u > lx0) & (u < lx1) & (v > ly0) & (v < ly1)
    foliage = soft_mask(foliage_raw & (~lantern_excl), close_r=5, blur_k=9)
    if "foliageZones" in reg:
        # Include moonlit blooms and feather the motion to zero near pot rims.
        bounds = np.zeros((h, w), dtype=np.float32)
        for cx, cy, rx, ry in reg["foliageZones"]:
            dist_sq = ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2
            bounds = np.maximum(bounds, np.clip((1.0 - dist_sq) / 0.42, 0.0, 1.0))
        leaf_or_bloom = (hue < 106) | (hue > 120) | ((val > 0.42) & (sat < 0.45))
        paint = ((depth > 0.08) & (bounds > 0) & leaf_or_bloom).astype(np.uint8)
        bleed = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        foliage = soft_mask(cv2.dilate(paint, bleed) > 0, close_r=5, blur_k=15) * bounds

    # 4. Primary warm lantern / lamp glow (R of glow)
    warm_amber = ((hue <= 32) | (hue >= 168)) & (sat > 0.25) & (val > 0.48)
    l1_roi = (u > lx0) & (u < lx1) & (v > ly0) & (v < ly1)
    l1_core = soft_mask(warm_amber & l1_roi, close_r=9, blur_k=15)
    cx1, cy1 = cfg["anchors"]["hangingLanternCenter"]
    radius_x, radius_y = reg.get("lanternHaloRadii", (0.095, 0.15))
    l1_halo = np.exp(-(((u - cx1) / radius_x) ** 2 + ((v - cy1) / radius_y) ** 2)) * 0.45
    glow1 = np.clip(np.maximum(l1_core, l1_halo), 0.0, 1.0)

    # 5. Secondary lantern / diya glow (G of glow)
    sx0, sx1, sy0, sy1 = reg["lantern2"]
    l2_roi = (u > sx0) & (u < sx1) & (v > sy0) & (v < sy1)
    l2_core = soft_mask((val > 0.56) & ((hue <= 36) | (hue >= 165)) & l2_roi, close_r=5, blur_k=9)
    cx2, cy2 = cfg["anchors"]["stoneLanternCenter"]
    l2_halo = np.exp(-(((u - cx2) / 0.06) ** 2 + ((v - cy2) / 0.085) ** 2)) * 0.52
    glow2 = np.clip(np.maximum(l2_core, l2_halo), 0.0, 1.0)
    if not cfg["effects"].get("secondaryGlow", True):
        glow2.fill(0)

    # 6. Valley mist / forest fog corridor (B of glow)
    mx0, mx1, my0, my1 = reg["mistBand"]
    mcx, mcy = (mx0 + mx1) * 0.5, (my0 + my1) * 0.5
    mr_x, mr_y = max((mx1 - mx0) * 0.5, 0.1), max((my1 - my0) * 0.5, 0.08)
    mist_band = np.exp(-(((u - mcx) / (mr_x * 1.1)) ** 2 + ((v - mcy) / (mr_y * 0.95)) ** 2))
    mist_depth = np.clip((0.32 - depth) / 0.22, 0.0, 1.0) * (1.0 - sky * 0.85)
    valley_mist = cv2.GaussianBlur((mist_band * mist_depth).astype(np.float32), (35, 35), 0)
    valley_mist = np.clip(valley_mist * 1.55, 0.0, 1.0)
    if "cloudBanks" in reg:
        clouds = polygon_mask((h, w), reg["cloudBanks"])
        inward = cv2.distanceTransform(clouds, cv2.DIST_L2, 5)
        valley_mist = np.clip(inward / (0.018 * w), 0.0, 1.0)

    mask_env = np.stack([water, sky, foliage], axis=-1)
    mask_glow = np.stack([glow1, glow2, valley_mist], axis=-1)
    return (mask_env * 255).astype(np.uint8), (mask_glow * 255).astype(np.uint8)


def slice_layers(rgb: np.ndarray, depth: np.ndarray, scene_out: Path, cfg: dict) -> list[dict]:
    scene_id = cfg["id"]
    h, w = rgb.shape[:2]
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / w, yy / h

    if "customThresholds" in cfg:
        q25, q52, q74, q88 = cfg["customThresholds"]
        print(f"  [{scene_id}] Custom depth thresholds: {q25:.3f}, {q52:.3f}, {q74:.3f}, {q88:.3f}")
    else:
        q25, q52, q74, q88 = np.percentile(depth, [28, 54, 74, 88])
        print(f"  [{scene_id}] Depth quantiles: {q25:.3f}, {q52:.3f}, {q74:.3f}, {q88:.3f}")

    # Keep any foreground hanging lantern + chain atomically intact on Layer 4
    # without grabbing adjacent roof eaves or veranda pillars.
    lantern_atomic = np.zeros((h, w), dtype=bool)
    if cfg.get("effects", {}).get("pendulumLantern"):
        lx0, lx1, ly0, ly1 = cfg["regions"]["lantern1"]
        piv_x, piv_y = cfg["anchors"]["hangingLanternPivot"]
        body_roi = (u >= lx0) & (u <= lx1) & (v >= ly0) & (v <= ly1)
        chain_roi = (np.abs(u - piv_x) <= 0.012) & (v >= piv_y) & (v <= ly0 + 0.02)
        roi = body_roi | chain_roi
        l_thresh = max(0.24, float(q25) + 0.16)
        raw_l = roi & (depth >= l_thresh)
        k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        closed = cv2.morphologyEx(raw_l.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k_close) > 0
        lantern_atomic = closed & roi
    elif scene_id == "pnw":
        # Keep the entire brass banker's lamp (shade + curved stem + base) intact on Layer 4
        lx0, lx1, ly0, ly1 = cfg["regions"]["lantern1"]
        lamp_roi = (u >= lx0) & (u <= lx1) & (v >= ly0) & (v <= ly1)
        raw_lamp = lamp_roi & (depth >= 0.34)
        k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        lantern_atomic = (cv2.morphologyEx(raw_lamp.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k_close) > 0) & lamp_roi

    m4_bin = (depth >= q88) | lantern_atomic
    m3_bin = (depth >= q74) & (~m4_bin)
    m2_bin = (depth >= q52) & (~m4_bin) & (~m3_bin)
    m1_bin = (depth >= q25) & (~m4_bin) & (~m3_bin) & (~m2_bin)
    if scene_id == "darjeeling":
        m1_bin, m2_bin, m3_bin, m4_bin = darjeeling_layer_masks(depth, u, v)
    elif scene_id == "kerala":
        m1_bin, m2_bin, m3_bin, m4_bin = kerala_layer_masks(depth, u, v)
    elif scene_id == "summer-terrace":
        m1_bin, m2_bin, m3_bin, m4_bin = summer_terrace_layer_masks(depth, u, v)

    def dilate_bin(b: np.ndarray, px: int) -> np.ndarray:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px, px))
        return cv2.dilate(b.astype(np.uint8), k, iterations=1) > 0

    layers_meta = [
        {"id": "layer_0_sky_valley", "z": -2.10, "parallax": 0.18, "mask": None},
        {"id": "layer_1_mid_far", "z": -1.15, "parallax": 0.42, "mask": m1_bin},
        {"id": "layer_2_midground", "z": -0.30, "parallax": 0.70, "mask": m2_bin},
        {"id": "layer_3_near_indoor", "z": 0.45, "parallax": 0.96, "mask": m3_bin},
        {"id": "layer_4_foreground", "z": 1.10, "parallax": 1.24, "mask": m4_bin},
    ]
    if scene_id == "darjeeling":
        # The roof and railing meet at the left post.
        for meta, z in zip(layers_meta, [-2.10, -1.45, 0.40, 0.42, 1.10]):
            meta["z"] = z
    elif scene_id == "summer-terrace":
        # Keep the sleepers and their contact shadows close to the tiled floor.
        for meta, z in zip(layers_meta, [-2.10, -1.95, 0.68, 0.69, 0.82]):
            meta["z"] = z

    occ_above = [
        m1_bin | m2_bin | m3_bin | m4_bin,
        m2_bin | m3_bin | m4_bin,
        m3_bin | m4_bin,
        m4_bin,
        np.zeros_like(m4_bin),
    ]

    exported = []
    for idx, meta in enumerate(layers_meta):
        name = meta["id"]
        if idx == 0:
            base_bgr = inpaint_occluded(bgr, (occ_above[0].astype(np.uint8)) * 255)
            base_rgb = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2RGB)
            rgba = np.dstack([base_rgb, np.full((h, w), 255, dtype=np.uint8)])
        else:
            layer_bgr = inpaint_occluded(bgr, (occ_above[idx].astype(np.uint8)) * 255)
            layer_rgb = cv2.cvtColor(layer_bgr, cv2.COLOR_BGR2RGB)
            raw_m = meta["mask"]
            if idx < 4:
                underlap = dilate_bin(raw_m, 22) & occ_above[idx]
                combined = raw_m | underlap
            else:
                combined = raw_m
            alpha_f = soft_mask(combined, close_r=5, blur_k=5)
            bled_rgb = dilate_rgb_bleed(layer_rgb, alpha_f, bleed_px=12)
            rgba = np.dstack([bled_rgb, np.clip(alpha_f * 255, 0, 255).astype(np.uint8)])

        out_path = scene_out / f"{name}.png"
        Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)
        exported.append(
            {
                "id": name,
                "file": f"assets/scenes/{scene_id}/{name}.png",
                "z": meta["z"],
                "parallax": meta["parallax"],
            }
        )
    return exported


def main() -> None:
    target_ids = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    device = (
        "mps"
        if torch.backends.mps.is_available()
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )
    print(f"[init] Loading {MODEL_ID} once on device={device} ...")
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID).to(device)
    model.eval()

    catalog = []
    for cfg in SCENES:
        sid = cfg["id"]
        src_path = SRC_DIR / cfg["source"]
        scene_out = SCENES_OUT / sid
        manifest_path = scene_out / "manifest.json"

        catalog.append(
            {
                "id": sid,
                "title": cfg["title"],
                "nativeTitle": cfg["nativeTitle"],
                "region": cfg["region"],
                "badge": cfg["badge"],
                "manifest": f"assets/scenes/{sid}/manifest.json",
            }
        )

        if target_ids is not None and sid not in target_ids and manifest_path.exists():
            print(f"[skip] {sid} (already built)")
            continue

        if not src_path.exists():
            print(f"[warn] Missing source {src_path}, skipping {sid}", file=sys.stderr)
            continue

        scene_out.mkdir(parents=True, exist_ok=True)
        pil_img = Image.open(src_path).convert("RGB")
        w, h = pil_img.size
        rgb = np.array(pil_img, dtype=np.uint8)
        print(f"[build] {sid}: {src_path.name} ({w}x{h})")

        depth = estimate_depth(pil_img, processor, model, device)
        depth_u8 = np.clip(depth * 255.0, 0, 255).astype(np.uint8)
        Image.fromarray(depth_u8, mode="L").save(scene_out / "depth_map.png", optimize=True)

        layers = slice_layers(rgb, depth, scene_out, cfg)
        mask_env, mask_glow = build_semantic_masks(rgb, depth, cfg)
        Image.fromarray(mask_env, mode="RGB").save(scene_out / "mask_env.png", optimize=True)
        Image.fromarray(mask_glow, mode="RGB").save(scene_out / "mask_glow.png", optimize=True)

        manifest = {
            "id": sid,
            "title": cfg["title"],
            "nativeTitle": cfg["nativeTitle"],
            "region": cfg["region"],
            "badge": cfg["badge"],
            "subtitle": cfg["subtitle"],
            "soundProfile": cfg["soundProfile"],
            "width": w,
            "height": h,
            "aspect": round(w / h, 6),
            "depthModel": MODEL_ID,
            "effects": cfg["effects"],
            "layers": layers,
            "depthMap": f"assets/scenes/{sid}/depth_map.png",
            "masks": {
                "env": f"assets/scenes/{sid}/mask_env.png",
                "glow": f"assets/scenes/{sid}/mask_glow.png",
            },
            "anchors": cfg["anchors"],
            "regions": cfg["regions"],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"  [{sid}] Done -> {manifest_path}")

    (OUT_ROOT / "scenes.json").write_text(json.dumps({"scenes": catalog}, indent=2))
    print(f"[all done] Wrote {OUT_ROOT / 'scenes.json'} ({len(catalog)} scenes)")


if __name__ == "__main__":
    main()
