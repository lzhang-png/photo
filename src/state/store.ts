import { create } from "zustand";
import { Adjustments, DEFAULT_ADJUSTMENTS } from "../editor/adjustments";
import type { DecodedImage } from "../editor/pipeline";

type EditorState = {
  image: DecodedImage | null;
  filename: string | null;
  adjustments: Adjustments;
  status: string | null;

  setImage: (image: DecodedImage, filename: string) => void;
  setAdjustment: <K extends keyof Adjustments>(key: K, value: Adjustments[K]) => void;
  resetAdjustments: () => void;
  setStatus: (msg: string | null) => void;
};

export const useEditor = create<EditorState>((set) => ({
  image: null,
  filename: null,
  adjustments: DEFAULT_ADJUSTMENTS,
  status: null,

  setImage: (image, filename) =>
    set({ image, filename, adjustments: DEFAULT_ADJUSTMENTS }),
  setAdjustment: (key, value) =>
    set((s) => ({ adjustments: { ...s.adjustments, [key]: value } })),
  resetAdjustments: () => set({ adjustments: DEFAULT_ADJUSTMENTS }),
  setStatus: (status) => set({ status }),
}));
