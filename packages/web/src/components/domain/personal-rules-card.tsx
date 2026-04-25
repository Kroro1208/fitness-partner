import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withDuplicateKeys } from "@/lib/list-keys";

export function PersonalRulesCard({ rules }: { rules: string[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-body">あなた専用のルール</CardTitle>
			</CardHeader>
			<CardContent>
				{rules.length === 0 ? (
					<p className="text-caption text-neutral-600">
						今週のルールはまだ生成されていません。
					</p>
				) : (
					<ol className="list-decimal space-y-1 pl-5 text-body text-neutral-900">
						{withDuplicateKeys(rules, String).map((rule) => (
							<li key={rule.key}>{rule.item}</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}
