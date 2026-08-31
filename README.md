# CV Lab

Interactive computer-vision demonstrations that run entirely in the browser. The site has no backend, build step, or external runtime dependencies. The page lets students explore image manipulation techniques discussed in the lectures.

## Lecture 4 demos

The **Filter banks & texture** sidebar section contains four separate Lecture 4 demonstrations: the existing Gabor filter-bank demo with prepared parameter comparisons, sunflower-based automatic scale selection, a staged 2D texture-feature projection, and an eight-response-map material classifier. All filtering and classification calculations run locally in the browser.

## Bundled images

The thumbnail picker reads `images/manifest.json`. To add or remove an image, place it in `images/` and update the JSON array.

## Gabor filter-bank textures

The Lecture 4 Gabor demo uses six bundled texture images. `brick.png`, `grass.png`, and `gravel.png` are CC0 samples distributed with [scikit-image](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_gabor.html); knit is a generated course asset, while the zebra and corridor samples were already bundled with this course project.

The Lecture 4 demos additionally use generated `images/lecture4/sunflower.webp` and `images/lecture4/knit.webp` teaching assets.
