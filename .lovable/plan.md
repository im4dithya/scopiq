# Visual UX Analysis — Screenshot Upload

Add an optional screenshot input to the teardown form so the AI can critique visual design (layout, typography, padding, color, friction) alongside the existing text analysis.

## 1. Server function (`src/lib/api/teardown.functions.ts`)

- Extend the Zod input schema with:
  - `screenshot: z.object({ data: z.string().max(7_500_000), mediaType: z.enum(["image/png","image/jpeg","image/webp"]) }).optional()`
  - (~7.5MB base64 ceiling covers the 5MB binary limit.)
- When `screenshot` is present, send the user message as a content-block array to the Lovable AI Gateway (OpenAI-compatible chat completions format):
  ```
  content: [
    { type: "text", text: userPrompt },
    { type: "image_url", image_url: { url: `data:${mediaType};base64,${data}` } }
  ]
  ```
  When absent, keep the existing string content.
- Append a conditional clause to the system prompt:
  > "If an image/screenshot is provided, actively inspect its visual design execution — layout hierarchy, typography, padding, color usage, and interface friction points — and weave those specific visual observations into the LinkedIn post."
- Keep model as `google/gemini-2.5-flash` (already multimodal-capable via the gateway).

## 2. Form UI (`src/routes/index.tsx`)

Insert a new "Screenshot (optional)" block between the Notes textarea and the Generate button.

**Dropzone (empty state):**
- Themed for the existing sky-blue glass aesthetic (not literal `bg-zinc-900`, since the app uses a custom blue gradient theme — match it via existing tokens / a new `.dropzone` class in `styles.css`).
- Dashed border, subtle surface, hover/drag-over state animates border to the accent.
- Upload icon (lucide `ImageUp`), text "Drag & drop a screenshot here, or click to browse", caption "Supports PNG, JPG, WEBP (Max 5MB)".
- Hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`; whole zone is clickable and handles `onDragOver` / `onDragLeave` / `onDrop`.

**Preview state (file selected):**
- Thumbnail (`URL.createObjectURL`), file name, formatted size, and an X "Remove" button that clears state and revokes the object URL.

## 3. State & validation

New state in `Index`:
- `screenshot: { file: File; previewUrl: string; base64: string } | null`
- `screenshotProcessing: boolean`
- `isDragging: boolean`

Handler `handleFile(file)`:
1. Validate `file.type ∈ {image/png, image/jpeg, image/webp}` and `file.size ≤ 5 * 1024 * 1024`. On failure → `toast.error(...)` (sonner) and abort.
2. Set `screenshotProcessing = true`.
3. Convert to base64 via `FileReader.readAsDataURL`, then strip the `data:<mime>;base64,` prefix so only the raw base64 payload is stored.
4. Store `{ file, previewUrl, base64 }`; clear processing flag.

`removeScreenshot()` revokes the object URL and nulls the state. `reset()` also calls it.

## 4. Submission flow

- Disable the Generate button while `loading || screenshotProcessing`; label changes to "Processing image…" when applicable.
- In `handleGenerate`, include `screenshot: screenshot ? { data: screenshot.base64, mediaType: screenshot.file.type } : undefined` in the server-fn payload.
- On error from the gateway (e.g. payload too large), surface via the existing `error` state.

## 5. Styling

Add a few classes to `src/styles.css` to keep the file consistent with the current `glass-card` / `field-input` system:
- `.dropzone`, `.dropzone-active` (drag-over accent border + subtle glow), `.dropzone-preview` (thumbnail row layout).

## Technical notes

- All image handling stays client-side until submit; base64 is sent only with the teardown request.
- Gateway accepts OpenAI-style `image_url` blocks with `data:` URLs — no separate upload endpoint or storage bucket required.
- No new dependencies; uses existing `sonner`, `lucide-react`, and Tailwind v4 tokens.

## Files touched

- `src/lib/api/teardown.functions.ts` — schema + multimodal content + prompt clause
- `src/routes/index.tsx` — dropzone UI, state, validation, submit wiring
- `src/styles.css` — dropzone classes
