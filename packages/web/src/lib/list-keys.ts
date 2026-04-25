export type KeyedItem<T> = {
	key: string;
	item: T;
};

export function withDuplicateKeys<T>(
	items: readonly T[],
	keyOf: (item: T) => string,
): KeyedItem<T>[] {
	const counts = new Map<string, number>();
	const keyedItems: KeyedItem<T>[] = [];

	for (const item of items) {
		const baseKey = keyOf(item);
		const count = counts.get(baseKey) ?? 0;
		counts.set(baseKey, count + 1);
		keyedItems.push({ key: `${baseKey}-${count}`, item });
	}

	return keyedItems;
}
