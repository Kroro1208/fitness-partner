/**
 * ID 生成を Input 境界として外部化する。
 * handler entry で一度だけ呼び、Process に渡す。
 * crypto.randomUUID は非決定値なので Input 扱い。
 */
export type IdGenerator = {
	mealId: () => string;
};

export const systemIdGenerator: IdGenerator = {
	mealId: () => crypto.randomUUID(),
};
