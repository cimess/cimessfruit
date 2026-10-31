import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchProductPage,
  type BrowseProductsInput,
} from "./service";

export function useProductBrowse(input: BrowseProductsInput) {
  const client = useQueryClient();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(
    AppState.currentState === "active",
  );
  const [search, setSearch] = useState(input.search.trim());

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      setActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [input.search]);

  const queryKey = useMemo(() => [
    "product-browse",
    input.category,
    input.sort,
    input.fruitFilter,
    search,
  ] as const, [input.category, input.sort, input.fruitFilter, search]);

  const ready =
    focused && active && search === input.search.trim();

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchProductPage({ ...input, search }, pageParam, signal),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: ready,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!ready) void client.cancelQueries({ queryKey, exact: true });
  }, [client, queryKey, ready]);

  const products = useMemo(() => {
    // Updates between batches can move products; avoid duplicate cards.
    const unique = new Map(
      query.data?.pages.flatMap(page =>
        page.items.map(product => [product.id, product] as const),
      ) ?? [],
    );
    return [...unique.values()];
  }, [query.data]);

  return {
    products: search === input.search.trim() ? products : [],
    total: search === input.search.trim() ? query.data?.pages[0]?.total ?? 0 : 0,
    loading: query.isPending || !ready,
    fetching: query.isFetching,
    loadingMore: query.isFetchingNextPage,
    error: ready ? query.error?.message ?? "" : "",

    loadMore: () => {
      if (
        ready &&
        query.hasNextPage &&
        !query.isFetching &&
        !query.isError
      ) {
        void query.fetchNextPage({ cancelRefetch: false });
      }
    },

    retry: () => {
      if (!ready || query.isFetching) return;

      if (query.isFetchNextPageError) {
        void query.fetchNextPage({ cancelRefetch: false });
      } else {
        void query.refetch();
      }
    },

    refresh: () => {
      if (ready && !query.isFetching) {
        // Reset to the first 20 instead of refreshing every loaded page.
        void client.resetQueries({ queryKey, exact: true });
      }
    },
  };
}
