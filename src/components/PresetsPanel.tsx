import { Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { NamedPreset } from "../editor/presets";
import { editSettingsEqual, extractEditSettings } from "../editor/adjustments";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SidebarSection } from "@/components/SidebarSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { selectAdjustments, selectImage, useEditor } from "../state/store";

export function PresetsPanel() {
  const disabled = !useEditor(selectImage);
  const adjustments = useEditor(selectAdjustments);
  const namedPresets = useEditor((s) => s.namedPresets);
  const saveNamedPreset = useEditor((s) => s.saveNamedPreset);
  const applyNamedPreset = useEditor((s) => s.applyNamedPreset);
  const deleteNamedPreset = useEditor((s) => s.deleteNamedPreset);

  const [draftName, setDraftName] = useState("");
  const [addingPreset, setAddingPreset] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NamedPreset | null>(null);

  const currentEdits = extractEditSettings(adjustments);

  const onSave = () => {
    const id = saveNamedPreset(draftName);
    if (id) {
      setDraftName("");
      setAddingPreset(false);
    }
  };

  const cancelAdd = () => {
    setDraftName("");
    setAddingPreset(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteNamedPreset(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
    <SidebarSection
      title="Presets"
      hint="Saved looks for tone, color, detail, effects, film, and curve. Crop, rotation, and straighten are not included."
    >
      <div className="space-y-3">
        {namedPresets.length === 0 ? (
          !addingPreset && (
            <p className="text-[11px] text-muted-foreground">
              No presets yet. Add one from the current photo&apos;s edits.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {namedPresets.map((preset) => {
              const active = editSettingsEqual(currentEdits, preset.edits);
              return (
                <div key={preset.id} className="group/preset relative">
                  <Toggle
                    variant="outline"
                    className={cn(
                      "h-auto min-h-9 w-full px-2 py-2 text-center text-xs leading-tight whitespace-normal",
                      active && "border-primary bg-primary/15 text-foreground",
                    )}
                    pressed={active}
                    disabled={disabled}
                    title={`Apply “${preset.name}”`}
                    onPressedChange={() => applyNamedPreset(preset.id)}
                  >
                    <span className="min-w-0">{preset.name}</span>
                  </Toggle>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="absolute -top-1.5 -right-1.5 size-6 opacity-0 shadow-sm transition-opacity group-hover/preset:opacity-100 group-focus-within/preset:opacity-100"
                    title={`Delete “${preset.name}”`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(preset);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {addingPreset ? (
          <div className="space-y-2">
            <Label htmlFor="preset-name" className="font-normal">
              Preset name
            </Label>
            <Input
              id="preset-name"
              type="text"
              value={draftName}
              disabled={disabled}
              autoFocus
              placeholder="e.g. Warm Portra"
              className="h-9 px-3"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") cancelAdd();
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={cancelAdd}
              >
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-9"
                disabled={disabled || !draftName.trim()}
                onClick={onSave}
              >
                <Save className="size-3.5" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full"
            disabled={disabled}
            onClick={() => setAddingPreset(true)}
          >
            <Plus className="size-3.5" />
            Add preset
          </Button>
        )}
      </div>
    </SidebarSection>
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
      title="Delete preset?"
      description={
        deleteTarget
          ? `“${deleteTarget.name}” will be removed permanently. This cannot be undone.`
          : null
      }
      confirmLabel="Delete"
      onConfirm={confirmDelete}
    />
    </>
  );
}
