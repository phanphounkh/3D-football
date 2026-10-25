"use client";
import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { authApi } from "@/lib/auth";

/** Authenticated GET. Holds the previous result while refetching so charts dim instead of flashing. */
export function useAuthQuery<T>(key: readonly unknown[], path: string, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: key, queryFn: () => authApi<T>(path), placeholderData: keepPreviousData as never, ...opts });
}
