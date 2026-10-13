# CV Lab

Interactive computer-vision demonstrations that run entirely in the browser. The site has no backend, build step, or external runtime dependencies. The page lets students explore image manipulation techniques discussed in the lectures.

## Lecture 4 demos

The **Filter banks & texture** sidebar section contains three separate Lecture 4 demonstrations: the existing Gabor filter-bank demo with prepared parameter comparisons, automatic scale selection in sunflower and sky-lantern scenes, and a material classifier built from real grass, wood, and knitted-fabric photographs. The scale-selection page computes normalized Difference-of-Gaussians responses at eight scales, marks local maxima in space and scale, uses a shared colour range for the response-map comparison, and lets the user resize the source image to observe the corresponding shift in characteristic scale. The classifier pools the mean absolute response of each Gabor filter into a 16-dimensional texture vector, fits PCA on 24 independent training photographs (eight per class), and compares 1-nearest-neighbour with nearest-class-mean decisions for patches from separate test photographs. All filtering, feature extraction, PCA, and classification calculations run locally in the browser.

## Lecture 7 demos

The **Local features** sidebar section follows "07. Local Features I: Keypoints". The Harris corner detector runs on whichever image is loaded in the toolbar, or on one of the photographs in its image strip, and shows the four steps of the summary slide: Sobel gradients, the Gaussian-weighted second-moment matrix M with cornerness R = det(M) − k·trace(M)², the threshold on R, and non-maximum suppression. Clicking any step image shows M, its eigenvalues, and R for that window, and places the window in the eigenvalue plane. A second view rotates, rescales, or changes the contrast of the image, reruns the detector with the first view's absolute threshold, and reports repeatability. The detected corners match scikit-image's `corner_harris` and `corner_peaks` when the image is edge-padded, as in the page's Python sample.

The non-maximum suppression page (slide 25) runs greedy NMS on the real Harris response of a 5 × 5 checkerboard, whose 16 interior X-junctions are the true corners. The response is clipped at zero and rescaled to integers 0–99. Each iteration keeps the largest remaining value and zeroes its window, and the zoomed blob shows the values, kept maxima, suppression windows, and zeroed cells as Step or Play advances. Two fixed cases show the response before and after NMS: a 3 × 3 window leaves blob shoulders that become duplicates, and a 49 × 49 window erases genuine neighboring corners. With the default stop threshold, windows from 7 × 7 to 39 × 39 return exactly the 16 corners. The module lives in `js/nms.js`.

The adaptive non-maximum suppression page (slide 26) compares the strongest N Harris corners with the N corners that have the largest suppression radii, r_i = min ‖x_i − x_j‖ over candidates with R_j > c·R_i, for N and 2N side by side. Each ANMS panel reports the smallest kept radius r and the share of an 8 × 6 grid that the keypoints cover. Clicking a point draws its radius and the stronger keypoint that sets it.

## Lecture 8 demos

The **Descriptors & matching** section follows "08. Local Features II: Descriptors". Both pages use `js/sift.js`, a browser implementation of SIFT that follows OpenCV step by step but skips OpenCV's initial 2× upsampling for speed. `scripts/verify_sift_opencv.py` checks it against `cv2.SIFT`: with upsampling enabled it finds the same number of keypoints, 98.5–98.9% of them match one to one, and their descriptors agree within 1 of 255.

The SIFT descriptor page (slides 24–28) follows one keypoint through the four descriptor steps: the scale- and orientation-normalized window, the Gaussian-weighted gradients on a 16 × 16 grid, the 4 × 4 × 8 orientation histograms, and normalization with clipping at 0.2. A second section rotates and zooms the scene, re-detects SIFT keypoints, and checks whether the corresponding descriptor is still the nearest neighbour, with and without orientation normalization.

The ratio test page (slides 32–37) matches up to 500 of the strongest SIFT keypoints between a photograph and a second view made from it with a known homography and a lighting change, so every match is graded against its true location (within 4 px). Moving the ratio threshold τ shows which matches are accepted or rejected, the TP/FP/FN/TN counts with precision, recall and specificity, the distribution of the ratio for correct and wrong nearest neighbours as on slide 33, and ROC curves for the ratio test and a plain distance threshold. An inspector shows the query f₁ beside its nearest (f₂) and second-nearest (f₂′) candidates. The UI is in `js/lecture8.js`.

## Bundled images

The thumbnail picker reads `images/manifest.json`. To add or remove an image, place it in `images/` and update the JSON array.

## Gabor filter-bank textures

The Lecture 4 Gabor demo uses five bundled texture images. Following the scikit-image reference method, each grayscale texture is standardized before filtering and the response is the phase-invariant power of the complex kernel at its original amplitude. Gamma = 1 reproduces the supplied circular-envelope reference; the gamma control extends it with a vertical envelope aspect ratio. Every power map uses one fixed display range, and the kernel preview uses a fixed ±40-pixel spatial frame so orientation changes cannot appear as zoom. `brick.png` and `grass.png` are CC0 samples distributed with [scikit-image](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_gabor.html); knit uses the supplied course attachment, while the zebra and corridor samples were already bundled with this course project.

The Lecture 4 demos additionally use `images/lecture4/sunflower.webp`, the supplied `images/lecture4/knit.png` teaching asset, two locally bundled Wikimedia Commons scale-selection scenes under `images/lecture4/scale/`, and 27 Wikimedia Commons photographs under `images/lecture4/materials/`. Source and licence links are shown directly on the relevant demo page.
