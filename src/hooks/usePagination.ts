import { useMemo, useState, useCallback, useEffect } from "react";

interface UsePaginationOptions {
  defaultPageSize?: number;
}

interface UsePaginationResult<T> {
  paginatedItems: T[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  goNext: () => void;
  goPrev: () => void;
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationResult<T> {
  const { defaultPageSize = 50 } = options;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to page 1 when items change (filters, sort, etc.)
  useEffect(() => {
    setCurrentPage(1);
  }, [totalItems]);

  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const setPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, totalPages));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  }, []);

  return {
    paginatedItems,
    currentPage: safePage,
    totalPages,
    pageSize,
    totalItems,
    setPage,
    setPageSize,
    goNext,
    goPrev,
  };
}
