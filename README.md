# CV Lab

Interactive computer-vision demonstrations that run entirely in the browser. The site has no backend, build step, or external runtime dependencies. The page lets students explore image manipulation techniques discussed in the lectures.

## Lecture 4 demos

The **Filter banks & texture** sidebar section contains three separate Lecture 4 demonstrations: the existing Gabor filter-bank demo with prepared parameter comparisons, automatic scale selection in sunflower and sky-lantern scenes, and a material classifier built from real grass, wood, and knitted-fabric photographs. The scale-selection page computes normalized Difference-of-Gaussians responses at eight scales, marks local maxima in space and scale, uses a shared colour range for the response-map comparison, and lets the user resize the source image to observe the corresponding shift in characteristic scale. The classifier pools the mean absolute response of each Gabor filter into a 16-dimensional texture vector, fits PCA on 24 independent training photographs (eight per class), and compares 1-nearest-neighbour with nearest-class-mean decisions for patches from separate test photographs. All filtering, feature extraction, PCA, and classification calculations run locally in the browser.

## Lecture 7 demos

The **Local features** sidebar section follows "07. Local Features I: Keypoints". The Harris corner detector runs on whichever image is loaded in the toolbar and shows the four steps of the summary slide: Sobel gradients, the Gaussian-weighted second-moment matrix M with cornerness R = det(M) − k·trace(M)², the threshold on R, and non-maximum suppression. Clicking any step image shows M, its eigenvalues, and R for that window, and places the window in the eigenvalue plane. A second view rotates, rescales, or changes the contrast of the image, reruns the detector with the first view's absolute threshold, and reports repeatability. The detected corners match scikit-image's `corner_harris` and `corner_peaks` when the image is edge-padded, as in the page's Python sample.

The non-maximum suppression page (slide 27) runs greedy NMS on the real Harris response of a 5 × 5 checkerboard, whose 16 interior X-junctions are the true corners. The response is clipped at zero and rescaled to integers 0–99. Each iteration keeps the largest remaining value and zeroes its window, and the zoomed blob shows the values, kept maxima, suppression windows, and zeroed cells as Step or Play advances. Two fixed cases show the response before and after NMS: a 3 × 3 window leaves blob shoulders that become duplicates, and a 49 × 49 window erases genuine neighboring corners. With the default stop threshold, windows from 7 × 7 to 39 × 39 return exactly the 16 corners. The module lives in `js/nms.js`.

## Bundled images

The thumbnail picker reads `images/manifest.json`. To add or remove an image, place it in `images/` and update the JSON array.

## Gabor filter-bank textures

The Lecture 4 Gabor demo uses five bundled texture images. Following the scikit-image reference method, each grayscale texture is standardized before filtering and the response is the phase-invariant power of the complex kernel at its original amplitude. Gamma = 1 reproduces the supplied circular-envelope reference; the gamma control extends it with a vertical envelope aspect ratio. Every power map uses one fixed display range, and the kernel preview uses a fixed ±40-pixel spatial frame so orientation changes cannot appear as zoom. `brick.png` and `grass.png` are CC0 samples distributed with [scikit-image](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_gabor.html); knit uses the supplied course attachment, while the zebra and corridor samples were already bundled with this course project.

The Lecture 4 demos additionally use `images/lecture4/sunflower.webp`, the supplied `images/lecture4/knit.png` teaching asset, two locally bundled Wikimedia Commons scale-selection scenes under `images/lecture4/scale/`, and 27 Wikimedia Commons photographs under `images/lecture4/materials/`. Source and licence links are shown directly on the relevant demo page.
