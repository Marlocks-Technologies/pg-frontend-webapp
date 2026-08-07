// Central list of document formats and template-eligible file types, shared
// between the Generate-mode picker in ChatInput and the post-answer download
// control in MessageBubble so the two pickers can never drift apart.

export const GEN_FORMATS: Array<{ value: string | null; label: string }> = [
  { value: null,   label: 'Auto' },
  { value: 'docx', label: 'Word' },
  { value: 'pdf',  label: 'PDF' },
  { value: 'pptx', label: 'Slides' },
  { value: 'xlsx', label: 'Sheet' },
];

// Only native Office formats can serve as house-style templates
export const NATIVE_TEMPLATE_EXT = /\.(docx|pptx|xlsx)$/i;
