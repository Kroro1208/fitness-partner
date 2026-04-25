import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyTabs } from "./daily-tabs";

afterEach(() => {
	cleanup();
});

describe("DailyTabs", () => {
	it("selectedDate に一致する tab を selected 表示にする", () => {
		render(
			<DailyTabs
				dates={["2026-04-20", "2026-04-21", "2026-04-22"]}
				selectedDate="2026-04-21"
				onSelect={vi.fn()}
			/>,
		);

		expect(screen.getByRole("tab", { name: /4\/21/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByRole("tab", { name: /4\/20/ })).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	it("tab click で選択日を通知する", () => {
		const onSelect = vi.fn();
		render(
			<DailyTabs
				dates={["2026-04-20", "2026-04-21"]}
				selectedDate="2026-04-20"
				onSelect={onSelect}
			/>,
		);

		fireEvent.click(screen.getByRole("tab", { name: /4\/21/ }));

		expect(onSelect).toHaveBeenCalledWith("2026-04-21");
	});
});
