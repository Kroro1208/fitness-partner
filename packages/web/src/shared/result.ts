// 業務エラーを「型」として伝搬するための Result 型。
// なぜ throw ではなく Result か:
//   - throw は呼び出し側に「成功時は T、失敗時は不在」を強制し、
//     失敗の種別を型で受け取れない (instanceof / catch の文字列 sniffing が必要)。
//   - Result は失敗パスを return value として明示するため、
//     「セッション切れ」「重複」「権限なし」を呼び出し元が switch で網羅できる。
// throw との使い分け:
//   - 通常運用で起きる失敗 (バリデーション、404、権限不足) → Result
//   - 想定外バグ・不変条件違反 (DB 不通、null であるべきが値) → throw

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
	return { ok: false, error };
}
