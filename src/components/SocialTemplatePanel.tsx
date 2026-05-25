import { Share2 } from "lucide-react";
import {
  exportSocialTemplateImage,
  shareSocialTemplateImage,
  type SocialTemplateBackground,
} from "../editor/socialTemplate";
import { downloadBlob } from "../editor/export";
import {
  selectAdjustments,
  selectFilename,
  selectImage,
  selectSocialTemplate,
  useEditor,
} from "../state/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SidebarSection } from "./SidebarSection";
import { cn } from "@/lib/utils";
import { useState } from "react";

function ColorCube({ color }: { color: SocialTemplateBackground }) {
  return (
    <span
      aria-hidden
      className={cn(
        "box-border size-3.5 shrink-0 rounded-[3px] border border-border dark:border-input",
        color === "white" ? "bg-white" : "bg-black",
      )}
    />
  );
}

export function SocialTemplatePanel() {
  const image = useEditor(selectImage);
  const filename = useEditor(selectFilename);
  const adjustments = useEditor(selectAdjustments);
  const social = useEditor(selectSocialTemplate);
  const setSocialTemplate = useEditor((s) => s.setSocialTemplate);
  const setStatus = useEditor((s) => s.setStatus);
  const [exporting, setExporting] = useState(false);
  const disabled = !image;

  const setBackground = (background: SocialTemplateBackground) => {
    setSocialTemplate({ background, enabled: true });
  };

  const onExportSocial = async () => {
    if (!image || !filename) return;
    setExporting(true);
    setStatus("Rendering social template…");
    try {
      const blob = await exportSocialTemplateImage(image, adjustments, social);
      const base = filename.replace(/\.[^.]+$/, "");
      const outName = `${base}-social.jpg`;
      const shared = await shareSocialTemplateImage(blob, outName);
      if (shared === "shared") {
        setStatus(`Shared ${outName}`);
      } else {
        await downloadBlob(blob, outName);
        setStatus(`Exported ${outName}`);
      }
    } catch (err) {
      setStatus(`Social export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SidebarSection
      title="Social Share"
      hint="Phone portrait frame for Instagram and other feeds. Your photo keeps its aspect ratio and fills the screen width; choose a white or black background for the letterbox areas."
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={social.enabled ? "default" : "outline"}
            className="h-9 flex-1"
            disabled={disabled}
            onClick={() =>
              setSocialTemplate({
                enabled: !social.enabled,
                background: social.background,
              })
            }
          >
            {social.enabled ? "Template on" : "Template off"}
          </Button>
        </div>

        {social.enabled && (
          <>
            <div className="space-y-2">
              <Label className="font-normal">Background</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={social.background === "white" ? "default" : "outline"}
                  className="h-9 gap-2"
                  disabled={disabled}
                  onClick={() => setBackground("white")}
                >
                  <ColorCube color="white" />
                  White
                </Button>
                <Button
                  type="button"
                  variant={social.background === "black" ? "default" : "outline"}
                  className="h-9 gap-2"
                  disabled={disabled}
                  onClick={() => setBackground("black")}
                >
                  <ColorCube color="black" />
                  Black
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full"
              disabled={disabled || exporting}
              onClick={onExportSocial}
            >
              <Share2 className="size-4" />
              {exporting ? "Exporting…" : "Export for social"}
            </Button>
          </>
        )}

        {!social.enabled && (
          <p className="text-[11px] text-muted-foreground">
            Turn on to preview a 9:19.5 phone layout in the viewer.
          </p>
        )}
      </div>
    </SidebarSection>
  );
}
