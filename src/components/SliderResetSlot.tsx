import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  visible: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function SliderResetSlot({ visible, disabled, onClick }: Props) {
  if (!visible) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-muted-foreground"
      title="Reset"
      disabled={disabled}
      onClick={onClick}
    >
      <RotateCcw className="size-4" />
    </Button>
  );
}
