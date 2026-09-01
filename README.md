# CV Lab

Interactive computer-vision demonstrations that run entirely in the browser. The site has no backend, build step, or external runtime dependencies. The page lets students explore image manipulation techniques discussed in the lectures.

## Lecture 4 demos

The **Filter banks & texture** sidebar section contains three separate Lecture 4 demonstrations: the existing Gabor filter-bank demo with prepared parameter comparisons, automatic scale selection in sunflower and sky-lantern scenes, and a material classifier built from real grass, wood, and knitted-fabric photographs. The scale-selection page computes normalized Difference-of-Gaussians responses at eight scales, marks local maxima in space and scale, uses a shared colour range for the response-map comparison, and lets the user resize the source image to observe the corresponding shift in characteristic scale. The classifier pools the mean absolute response of each Gabor filter into a 16-dimensional texture vector, fits PCA on 24 independent training photographs (eight per class), and compares 1-nearest-neighbour with nearest-class-mean decisions for patches from separate test photographs. All filtering, feature extraction, PCA, and classification calculations run locally in the browser.

## Bundled images

The thumbnail picker reads `images/manifest.json`. To add or remove an image, place it in `images/` and update the JSON array.

## Gabor filter-bank textures

The Lecture 4 Gabor demo uses five bundled texture images. Following the scikit-image reference method, each grayscale texture is standardized before filtering and the response is the phase-invariant power of the complex kernel at its original amplitude. Gamma = 1 reproduces the supplied circular-envelope reference; the gamma control extends it with a vertical envelope aspect ratio. Every power map uses one fixed display range, and the kernel preview uses a fixed ±40-pixel spatial frame so orientation changes cannot appear as zoom. `brick.png` and `grass.png` are CC0 samples distributed with [scikit-image](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_gabor.html); knit uses the supplied course attachment, while the zebra and corridor samples were already bundled with this course project.

The Lecture 4 demos additionally use `images/lecture4/sunflower.webp`, the supplied `images/lecture4/knit.png` teaching asset, two locally bundled Wikimedia Commons scale-selection scenes under `images/lecture4/scale/`, and 27 Wikimedia Commons photographs under `images/lecture4/materials/`. Source and licence links are shown directly on the relevant demo page.
