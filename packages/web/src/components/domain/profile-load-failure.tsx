import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type ProfileLoadFailureProps = {
	title: string;
	description: string;
};

export function ProfileLoadFailure({
	title,
	description,
}: ProfileLoadFailureProps) {
	return (
		<div className="min-h-dvh bg-canvas px-4 py-10">
			<Card className="mx-auto max-w-lg">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-neutral-700">
					プロフィールを確認できる状態になってから画面を再表示してください。
				</CardContent>
			</Card>
		</div>
	);
}
