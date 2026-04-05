import json
import math
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except Exception as exc:  # pragma: no cover - runtime dependency guard
    print(json.dumps({"error": f"OpenCV dependency is unavailable: {exc}"}))
    sys.exit(1)


MAX_WORKING_SIDE = 2200
MIN_COMPONENT_AREA = 700
MIN_COMPONENT_SIDE = 15
MAX_COMPONENT_AREA = 15000
MIN_FILL_RATIO = 0.65
MAX_ASPECT_RATIO = 7.0
AXIS_ALIGNMENT_TOLERANCE_DEGREES = 5.0


def resize_for_analysis(image):
    height, width = image.shape[:2]
    longest_side = max(width, height)

    if longest_side <= MAX_WORKING_SIDE:
        return image, 1.0

    scale = MAX_WORKING_SIDE / float(longest_side)
    resized = cv2.resize(
        image,
        (int(round(width * scale)), int(round(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


def build_line_mask(image):
    grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thresholded = cv2.adaptiveThreshold(
        grayscale,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        25,
        8,
    )
    kernel = np.ones((3, 3), np.uint8)
    return cv2.morphologyEx(thresholded, cv2.MORPH_CLOSE, kernel, iterations=1)


def compute_right_angle_score(points):
    if len(points) != 4:
        return 0.0

    scores = []

    for index in range(4):
        previous_point = points[index - 1]
        current_point = points[index]
        next_point = points[(index + 1) % 4]

        vector_a = previous_point - current_point
        vector_b = next_point - current_point
        magnitude = np.linalg.norm(vector_a) * np.linalg.norm(vector_b)

        if magnitude <= 1e-6:
            return 0.0

        cosine = np.clip(np.dot(vector_a, vector_b) / magnitude, -1.0, 1.0)
        angle = math.degrees(math.acos(cosine))
        scores.append(max(0.0, 1.0 - abs(angle - 90.0) / 35.0))

    return float(sum(scores) / len(scores))


def compute_polygon_area(points):
    if len(points) < 3:
        return 0.0

    area = 0.0

    for index in range(len(points)):
        current_x, current_y = points[index]
        next_x, next_y = points[(index + 1) % len(points)]
        area += current_x * next_y - next_x * current_y

    return abs(area) * 0.5


def order_polygon_points(points):
    if len(points) < 3:
        return points

    center = np.mean(points, axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    ordered = points[np.argsort(angles)]
    start_index = min(
        range(len(ordered)),
        key=lambda index: (ordered[index][1], ordered[index][0]),
    )

    return np.roll(ordered, -start_index, axis=0)


def compute_axis_alignment_deviation(points):
    if len(points) < 4:
        return 0.0

    ordered = order_polygon_points(points.astype(np.float32))
    max_deviation = 0.0

    for index in range(len(ordered)):
        start_point = ordered[index]
        end_point = ordered[(index + 1) % len(ordered)]
        delta_x = float(end_point[0] - start_point[0])
        delta_y = float(end_point[1] - start_point[1])
        angle = abs(math.degrees(math.atan2(delta_y, delta_x))) % 180.0
        deviation = min(abs(angle - target) for target in (0.0, 90.0, 180.0))
        max_deviation = max(max_deviation, deviation)

    return max_deviation


def extract_polygon_outline(contour):
    contour_area = max(cv2.contourArea(contour), 1.0)
    best_polygon = None
    best_rank = None

    for source in (contour, cv2.convexHull(contour)):
        perimeter = cv2.arcLength(source, True)

        for epsilon_factor in (0.012, 0.018, 0.026, 0.034, 0.048, 0.064):
            approximation = cv2.approxPolyDP(source, perimeter * epsilon_factor, True).reshape(-1, 2)
            cleaned = remove_collinear_points(approximation)

            if len(cleaned) < 3:
                continue

            ordered = order_polygon_points(cleaned.astype(np.int32))
            polygon_area = max(compute_polygon_area(ordered), 1.0)
            area_ratio = min(polygon_area, contour_area) / max(polygon_area, contour_area)
            point_penalty = abs(len(ordered) - 4)
            rank = (point_penalty, -area_ratio, len(ordered))

            if best_polygon is None or rank < best_rank:
                best_polygon = ordered.astype(np.int32)
                best_rank = rank

            if len(ordered) == 4 and area_ratio >= 0.84:
                return ordered.astype(np.int32)

    if best_polygon is not None:
        return best_polygon

    return order_polygon_points(simplify_polygon(contour).astype(np.int32))


def simplify_polygon(contour):
    perimeter = cv2.arcLength(contour, True)
    epsilon_factors = (0.016, 0.024, 0.034, 0.048)

    best = contour.reshape(-1, 2)
    best_count = len(best)

    for epsilon_factor in epsilon_factors:
        approximation = cv2.approxPolyDP(contour, perimeter * epsilon_factor, True).reshape(-1, 2)
        if len(approximation) >= 3:
            best = approximation
            best_count = len(approximation)

        if 3 <= best_count <= 8:
            break

    return remove_collinear_points(best)


def remove_collinear_points(points):
    if len(points) < 4:
        return points

    simplified = []
    total_points = len(points)

    for index in range(total_points):
        previous_point = points[index - 1].astype(np.float32)
        current_point = points[index].astype(np.float32)
        next_point = points[(index + 1) % total_points].astype(np.float32)

        vector_a = current_point - previous_point
        vector_b = next_point - current_point
        denominator = np.linalg.norm(vector_a) * np.linalg.norm(vector_b)

        if denominator <= 1e-6:
            continue

        cross_ratio = abs((vector_a[0] * vector_b[1]) - (vector_a[1] * vector_b[0])) / denominator

        if cross_ratio > 0.035 or len(simplified) < 3:
            simplified.append(points[index])

    if len(simplified) < 3:
        return points

    return np.array(simplified, dtype=np.int32)


def is_rectangle_like(contour, bounds):
    _, _, width, height = bounds
    if width <= 0 or height <= 0:
        return False

    contour_area = max(cv2.contourArea(contour), 1.0)
    bounding_area = float(width * height)
    bounding_ratio = contour_area / bounding_area

    (_, _), (min_rect_width, min_rect_height), _ = cv2.minAreaRect(contour)
    min_rect_area = max(float(min_rect_width * min_rect_height), 1.0)
    rotated_ratio = contour_area / min_rect_area

    hull = cv2.convexHull(contour)
    hull_area = max(cv2.contourArea(hull), 1.0)
    solidity = contour_area / hull_area
    hull_bounding_ratio = hull_area / bounding_area

    coarse = cv2.approxPolyDP(contour, cv2.arcLength(contour, True) * 0.05, True).reshape(-1, 2)
    coarse_count = len(coarse)
    right_angle_score = compute_right_angle_score(coarse)
    hull_coarse = cv2.approxPolyDP(hull, cv2.arcLength(hull, True) * 0.05, True).reshape(-1, 2)
    hull_right_angle_score = compute_right_angle_score(hull_coarse)
    hull_axis_deviation = compute_axis_alignment_deviation(hull_coarse)
    coarse_axis_deviation = compute_axis_alignment_deviation(coarse)

    if (
        coarse_count == 4
        and right_angle_score >= 0.72
        and bounding_ratio >= 0.72
        and coarse_axis_deviation <= AXIS_ALIGNMENT_TOLERANCE_DEGREES
    ):
        return True

    if (
        len(hull_coarse) == 4
        and hull_right_angle_score >= 0.72
        and hull_bounding_ratio >= 0.78
        and hull_axis_deviation <= AXIS_ALIGNMENT_TOLERANCE_DEGREES
    ):
        return True

    if len(hull_coarse) == 4 and hull_axis_deviation > AXIS_ALIGNMENT_TOLERANCE_DEGREES:
        return False

    if bounding_ratio >= 0.79 and rotated_ratio >= 0.84 and solidity >= 0.85:
        return True

    return (
        bounding_ratio >= 0.8
        and rotated_ratio >= 0.84
        and solidity >= 0.92
        and coarse_count <= 6
    )


def build_plot_record(component, sort_index, inverse_scale):
    x, y, width, height = component["bounds"]
    contour = component["contour"]
    center_x, center_y = component["center"]

    origin_x = int(round(x * inverse_scale))
    origin_y = int(round(y * inverse_scale))
    origin_width = max(1, int(round(width * inverse_scale)))
    origin_height = max(1, int(round(height * inverse_scale)))

    record = {
        "id": f"auto-{sort_index + 1}",
        "plotNo": str(sort_index + 1),
        "plotWidth": "",
        "plotHeight": "",
        "area": 0,
        "status": "Available",
        "x": origin_x,
        "y": origin_y,
        "width": origin_width,
        "height": origin_height,
        "centerX": round(center_x * inverse_scale, 2),
        "centerY": round(center_y * inverse_scale, 2),
        "points": [],
    }

    if not component["is_rectangle"]:
        polygon = extract_polygon_outline(contour) + np.array([x, y], dtype=np.int32)
        scaled_points = []

        for point in polygon:
            scaled_points.extend(
                [
                    int(round(point[0] * inverse_scale)),
                    int(round(point[1] * inverse_scale)),
                ]
            )

        if len(scaled_points) >= 6:
            record["points"] = scaled_points

    return record


def collect_components(image):
    line_mask = build_line_mask(image)
    space_mask = cv2.bitwise_not(line_mask)
    image_height, image_width = image.shape[:2]

    total_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(space_mask, connectivity=4)
    components = []

    for label_index in range(1, total_labels):
        x, y, width, height, area = stats[label_index]

        if x <= 0 or y <= 0 or x + width >= image_width or y + height >= image_height:
            continue

        if (
            area < MIN_COMPONENT_AREA
            or area > MAX_COMPONENT_AREA
            or width < MIN_COMPONENT_SIDE
            or height < MIN_COMPONENT_SIDE
        ):
            continue

        fill_ratio = area / float(width * height)
        aspect_ratio = max(width / float(height), height / float(width))

        if fill_ratio < MIN_FILL_RATIO or aspect_ratio > MAX_ASPECT_RATIO:
            continue

        component_mask = (labels[y : y + height, x : x + width] == label_index).astype(np.uint8) * 255
        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            continue

        contour = max(contours, key=cv2.contourArea)
        contour_area = cv2.contourArea(contour)

        if contour_area < area * 0.55:
            continue

        is_rectangle = is_rectangle_like(contour, (x, y, width, height))
        center_x, center_y = centroids[label_index]

        components.append(
            {
                "bounds": (int(x), int(y), int(width), int(height)),
                "center": (float(center_x), float(center_y)),
                "contour": contour,
                "is_rectangle": is_rectangle,
            }
        )

    return components


def sort_components(components):
    if not components:
        return []

    median_height = float(np.median([component["bounds"][3] for component in components]))
    row_size = max(18.0, median_height * 0.7)

    return sorted(
        components,
        key=lambda component: (
            int(round(component["center"][1] / row_size)),
            component["center"][1],
            component["center"][0],
        ),
    )


def extract_outer_boundary(image):
    line_mask = build_line_mask(image)
    # The outer boundary usually surrounds all components. 
    # Let's find large external contours.
    contours, _ = cv2.findContours(line_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return []
    
    # Sort contours by area descending
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    largest_contour = contours[0]
    
    # Simplify the contour heavily to get the outer boundary shape
    perimeter = cv2.arcLength(largest_contour, True)
    # Try different epsilons to get a nice polygon for the border
    approximation = cv2.approxPolyDP(largest_contour, perimeter * 0.005, True).reshape(-1, 2)
    
    # Scale back to original size (just return the points for now, they are scaled in analyze_layout)
    return approximation


def analyze_layout(image_path):
    source = cv2.imread(str(image_path), cv2.IMREAD_COLOR)

    if source is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    resized, resize_scale = resize_for_analysis(source)
    inverse_scale = 1.0 / resize_scale
    components = sort_components(collect_components(resized))
    plots = [
        build_plot_record(component, index, inverse_scale)
        for index, component in enumerate(components)
    ]

    rectangle_count = sum(1 for plot in plots if not plot["points"])
    polygon_count = len(plots) - rectangle_count
    
    outer_boundary_points = extract_outer_boundary(resized)
    scaled_boundary = []
    for pt in outer_boundary_points:
        scaled_boundary.extend([
            int(round(pt[0] * inverse_scale)),
            int(round(pt[1] * inverse_scale))
        ])

    return {
        "plots": plots,
        "boundary": scaled_boundary,
        "meta": {
            "totalPlots": len(plots),
            "rectanglePlots": rectangle_count,
            "polygonPlots": polygon_count,
            "analysisWidth": int(resized.shape[1] * inverse_scale),
            "analysisHeight": int(resized.shape[0] * inverse_scale),
        },
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path is required"}))
        sys.exit(1)

    image_path = Path(sys.argv[1]).resolve()

    if not image_path.exists():
        print(json.dumps({"error": f"Image not found: {image_path}"}))
        sys.exit(1)

    try:
        result = analyze_layout(image_path)
    except Exception as exc:  # pragma: no cover - runtime failure guard
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
