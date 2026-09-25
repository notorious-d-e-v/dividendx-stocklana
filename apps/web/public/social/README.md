# Social preview images

Captured on 25 September 2026 from the locally rendered DivX UI at 1440 × 756 (the 1200:630 social-card ratio). The capture used unchanged, read-only production GET responses and did not create a sandbox VM. These are unedited browser screenshots, stored in the browser's native JPEG format.

- `app-preview-divx-v1.jpg`: `/app/` Market landing page, runtime loaded, wallet disconnected. Used by `/` and `/app/`.
- `demos-preview-divx-v1.jpg`: `/demos/` landing hero in its ready state, before starting the guided tour. Used by `/demos/`. No sandbox gate, wallet keys or session URLs appear in the image.
- `app-preview-v1.jpg` and `demos-preview-v1.jpg`: compatibility aliases containing the same rebranded captures so previously cached paths do not expose the old name.

The images are public static assets. Social crawlers read their absolute URLs from HTML meta tags without JavaScript, cookies or sandbox creation. They do not alter the normal visitor session flow.

To refresh: capture the same actual landing states at the same dimensions, review the crop, use a new versioned filename, and update both OG and Twitter image tags. Keep declared format/dimensions aligned with the actual file. Social platforms can cache previously fetched cards independently of our deployment.
