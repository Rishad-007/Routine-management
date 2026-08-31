"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Season } from "@/lib/constants";

export function useSeason(): { season: Season; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["settings", "season"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "season")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const v = (data?.value as string | undefined) ?? "summer";
      return v === "winter" ? "winter" : "summer";
    },
  });

  return {
    season: query.data ?? "summer",
    isLoading: query.isLoading,
  };
}
