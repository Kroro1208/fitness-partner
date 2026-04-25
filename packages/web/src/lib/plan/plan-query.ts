export function planQueryKey(weekStart: string) {
	return ["weekly-plan", weekStart] as const;
}
