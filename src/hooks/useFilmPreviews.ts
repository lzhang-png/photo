import { useEffect, useState } from "react";
import { buildFilmPreviewUrls } from "../editor/filmPreviews";
import type { FilmId } from "../editor/filmStocks";

export function useFilmPreviewUrls(): Partial<Record<FilmId, string>> {
  const [urls, setUrls] = useState<Partial<Record<FilmId, string>>>({});

  useEffect(() => {
    let cancelled = false;
    buildFilmPreviewUrls()
      .then((next) => {
        if (!cancelled) setUrls(next);
      })
      .catch(() => {
        if (!cancelled) setUrls({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return urls;
}
