# Homepage backgrounds

The hero cycles through three generated sport illustrations styled as night photography:
padel, cricket and futsal. They use charcoal shadows, green turf, lime accents and ivory
floodlights to match the app. These are illustrative scenes, not photographs of MadHaus.
A fourth background uses the owner's actual café photograph, color graded to match.

Assets live at `public/images/hero/{padel,cricket,futsal}.webp`. Generated with the built-in
imagegen tool, then optimized to WebP for the website.

The Sanity homepage hero image, when supplied, leads the four-image sequence.
Text and buttons remain editable in Sanity. This slideshow replaces the former hero video
presentation. Backgrounds fade every seven seconds and stay static
when reduced motion is requested. The images are decorative to screen readers.
Slides advance only to loaded images, keeping the current photo visible during slow
or failed requests. The café slide uses a lighter overlay to preserve the venue lighting.

## Generation prompts

Each asset used this prompt, substituting the sport scene below:

> Use case: photorealistic-natural. Asset type: wide website hero background photograph,
> landscape 1536x1024. Primary request: [sport scene]. Fictional sports venue in Pakistan
> at night, athletic adults, realistic sports equipment and court geometry, premium candid
> editorial photography. Palette: deep charcoal black, muted forest green turf, subtle
> acid lime accents, ivory floodlights. Subjects concentrated center-right, darker spacious
> left for website headline. Dramatic floodlighting, restrained saturation, natural texture,
> no text, no logos, no watermarks. A generic illustrative venue, not a depiction of a
> specific real facility. Save generated output locally for use in the project.

- Padel: padel rally on a glass-walled padel court with perforated solid padel rackets and yellow ball.
- Cricket: box cricket batter wearing helmet with cricket bat and stumps on enclosed artificial turf.
- Futsal: futsal players moving a football across an enclosed small artificial turf court.

## Café photo edit

Source: `/Users/mac/Downloads/IMG_0193.HEIC`. Converted to PNG for the built-in imagegen
edit, then saved as `public/images/hero/cafe-v2.webp`. The original file is preserved.
The versioned filename refreshes image caches without a local image query string.

Prompt: subtly grade the real café photograph for the charcoal/lime theme, preserving
its architecture, signage, trees, lights, seating, pathway and people. Keep the original
portrait perspective; use charcoal shadows, muted forest-green foliage, controlled
ivory/amber highlights and a subdued grey pathway. Retain realistic texture and the
warm hanging lights, with no invented venue details, text or objects.
