import { useEffect, useState } from "react";

type TextSizePreference = "normal" | "large";

const STORAGE_KEY = "text-size-preference";

export const useTextSize = () => {
  const [textSize, setTextSize] = useState<TextSizePreference>("normal");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedPreference = localStorage.getItem(STORAGE_KEY) as TextSizePreference | null;
    if (savedPreference) {
      setTextSize(savedPreference);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, textSize);
  }, [textSize]);

  const toggleTextSize = () => {
    setTextSize((prev) => (prev === "normal" ? "large" : "normal"));
  };

  const textSizeClass = textSize === "large"
    ? "text-[20px] md:text-[21px] leading-relaxed"
    : "text-[18px] md:text-[19px] leading-relaxed";

  return { textSize, toggleTextSize, textSizeClass };
};
