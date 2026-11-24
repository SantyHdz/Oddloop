import { toast } from "sonner";
import { useMe } from "@/features/auth/useMe";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/messages";
import { playSound } from "@/lib/sounds";

// One place for toasts: errors are translated from the API code and play the error sound
// unless the person muted sounds in "Mi cuenta".
export function useFeedback() {
  const { data: me } = useMe();
  return {
    success: (text: string) => toast.success(text),
    fail: (error: unknown) => {
      toast.error(errorMessage(error instanceof ApiError ? error.code : "unknown"));
      playSound("error", me?.soundEnabled ?? false);
    },
  };
}
