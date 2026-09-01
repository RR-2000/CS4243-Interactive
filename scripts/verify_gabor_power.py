"""Numerically compare the browser Gabor power computation with the Python reference.

The reference path below uses the same equations, support rule, image
standardization, and wrap convolution as skimage.filters.gabor_kernel plus
scipy.ndimage.convolve.  It is intentionally implemented with NumPy so the
check can run in the course repository without SciPy or scikit-image installed.
"""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TEXTURES = {
    "brick": ROOT / "images/gabor/brick.png",
    "grass": ROOT / "images/gabor/grass.png",
    "knit": ROOT / "images/lecture4/knit.png",
}
SETTINGS = (
    (0, 4, 6),
    (0, 4, 10),
    (45, 4, 10),
    (90, 4, 18),
)


def load_standardized(path: Path, size: int = 144) -> np.ndarray:
    with Image.open(path) as source:
        rgb = source.convert("RGB")
        side = min(rgb.size)
        left = (rgb.width - side) / 2
        top = (rgb.height - side) / 2
        rgb = rgb.crop((left, top, left + side, top + side)).resize(
            (size, size), Image.Resampling.BILINEAR
        )
    pixels = np.asarray(rgb, dtype=np.float64)
    gray = pixels @ np.array([0.299, 0.587, 0.114])
    return (gray - gray.mean()) / (gray.std() or 1.0)


def reference_kernel(theta_degrees: float, sigma: float, wavelength: float) -> np.ndarray:
    """Equivalent to gabor_kernel(1/lambda, theta, sigma, sigma)."""
    theta = np.deg2rad(theta_degrees)
    radius = int(
        np.ceil(
            max(
                abs(3 * sigma * np.cos(theta)),
                abs(3 * sigma * np.sin(theta)),
                1,
            )
        )
    )
    y, x = np.mgrid[-radius : radius + 1, -radius : radius + 1]
    rotated_x = x * np.cos(theta) + y * np.sin(theta)
    envelope = np.exp(-0.5 * (x * x + y * y) / (sigma * sigma))
    carrier = np.exp(1j * 2 * np.pi * rotated_x / wavelength)
    return envelope * carrier / (2 * np.pi * sigma * sigma)


def wrap_convolve(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """Circular convolution, equivalent to ndi.convolve(..., mode='wrap')."""
    height, width = image.shape
    radius_y, radius_x = (extent // 2 for extent in kernel.shape)
    padded = np.zeros_like(image, dtype=np.complex128)
    for row in range(kernel.shape[0]):
        for column in range(kernel.shape[1]):
            padded[(row - radius_y) % height, (column - radius_x) % width] = kernel[
                row, column
            ]
    return np.fft.ifft2(np.fft.fft2(image) * np.fft.fft2(padded))


def reference_power(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    real = wrap_convolve(image, np.real(kernel)).real
    imaginary = wrap_convolve(image, np.imag(kernel)).real
    return np.hypot(real, imaginary)


def browser_power(image: np.ndarray, theta_degrees: float, sigma: float, wavelength: float) -> np.ndarray:
    """Direct port of makeGaborKernel + correlateSeparable in js/app.js."""
    theta = np.deg2rad(theta_degrees)
    radius = int(
        np.ceil(
            max(
                abs(3 * sigma * np.cos(theta)),
                abs(3 * sigma * np.sin(theta)),
                1,
            )
        )
    )
    coordinate = np.arange(-radius, radius + 1, dtype=np.float64)
    envelope = np.exp(-(coordinate**2) / (2 * sigma * sigma))
    norm = 1 / (2 * np.pi * sigma * sigma)
    wave_x = 2 * np.pi * np.cos(theta) / wavelength
    wave_y = 2 * np.pi * np.sin(theta) / wavelength
    x_cos = norm * envelope * np.cos(wave_x * coordinate)
    x_sin = norm * envelope * np.sin(wave_x * coordinate)
    y_cos = envelope * np.cos(wave_y * coordinate)
    y_sin = envelope * np.sin(wave_y * coordinate)

    def correlate_separable(horizontal: np.ndarray, vertical: np.ndarray) -> np.ndarray:
        temporary = sum(
            coefficient * np.roll(image, -offset, axis=1)
            for offset, coefficient in zip(coordinate.astype(int), horizontal)
        )
        return sum(
            coefficient * np.roll(temporary, -offset, axis=0)
            for offset, coefficient in zip(coordinate.astype(int), vertical)
        )

    real = correlate_separable(x_cos, y_cos) - correlate_separable(x_sin, y_sin)
    imaginary = correlate_separable(x_sin, y_cos) + correlate_separable(x_cos, y_sin)
    return np.hypot(real, imaginary)


def main() -> None:
    worst_error = 0.0
    worst_correlation = 1.0
    print("texture  theta  sigma  lambda  max_abs_error   correlation")
    for name, path in TEXTURES.items():
        image = load_standardized(path)
        for theta, sigma, wavelength in SETTINGS:
            expected = reference_power(image, reference_kernel(theta, sigma, wavelength))
            actual = browser_power(image, theta, sigma, wavelength)
            error = float(np.max(np.abs(expected - actual)))
            correlation = float(np.corrcoef(expected.ravel(), actual.ravel())[0, 1])
            worst_error = max(worst_error, error)
            worst_correlation = min(worst_correlation, correlation)
            print(
                f"{name:7s} {theta:5.0f} {sigma:6.1f} {wavelength:7.1f}"
                f" {error:14.3e} {correlation:13.10f}"
            )
    print(f"\nworst max absolute error: {worst_error:.3e}")
    print(f"worst response-map correlation: {worst_correlation:.10f}")
    if worst_error > 1e-10 or worst_correlation < 0.999999999:
        raise SystemExit("FAIL: browser and Python reference do not agree")
    print("PASS: browser and Python reference power maps agree numerically")


if __name__ == "__main__":
    main()
