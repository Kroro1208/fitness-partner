import { cn } from "@/lib/utils";

type ProgressRingProps = {
	value: number;
	size?: number;
	strokeWidth?: number;
	label?: React.ReactNode;
	sublabel?: React.ReactNode;
	className?: string;
	ariaLabel?: string;
};

export function ProgressRing({
	value,
	size = 96,
	strokeWidth = 10,
	label,
	sublabel,
	className,
	ariaLabel,
}: ProgressRingProps) {
	const clamped = Math.max(0, Math.min(100, value));
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference * (1 - clamped / 100);
	const center = size / 2;

	return (
		<div
			className={cn(
				"relative inline-flex items-center justify-center",
				className,
			)}
			style={{ width: size, height: size }}
			role="img"
			aria-label={ariaLabel ?? `進捗 ${clamped}%`}
		>
			<svg
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				className="-rotate-90"
				aria-hidden
				focusable="false"
			>
				<title>{ariaLabel ?? `進捗 ${clamped}%`}</title>
				<circle
					cx={center}
					cy={center}
					r={radius}
					strokeWidth={strokeWidth}
					className="fill-none stroke-neutral-200"
				/>
				<circle
					cx={center}
					cy={center}
					r={radius}
					strokeWidth={strokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					className="fill-none stroke-primary-500 transition-[stroke-dashoffset] duration-500 ease-out"
				/>
			</svg>
			{(label !== undefined || sublabel !== undefined) && (
				<div className="absolute inset-0 flex flex-col items-center justify-center">
					{label !== undefined && (
						<div className="text-title font-semibold tabular text-neutral-900 leading-none">
							{label}
						</div>
					)}
					{sublabel !== undefined && (
						<div className="mt-1 text-caption text-neutral-600">{sublabel}</div>
					)}
				</div>
			)}
		</div>
	);
}
