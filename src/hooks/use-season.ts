import type { Season } from "@/lib/constants";
import { getCurrentSeason } from "@/lib/periods";

export function useSeason(): { season: Season; isLoading: boolean } {
  return {
    season: getCurrentSeason(),
    isLoading: false,
  };
}
