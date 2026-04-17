/**
 * 現在時刻取得を Input 境界として外部化する。
 * handler entry で now() を1度だけ呼び、Process に文字列で渡すことで、
 * Process を決定論的・テスト容易に保つ。
 */
export type Clock = {
	now: () => Date;
};

export const systemClock: Clock = {
	now: () => new Date(),
};
