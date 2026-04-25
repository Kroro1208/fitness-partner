import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withDuplicateKeys } from "@/lib/list-keys";

export function TimelineCard({ notes }: { notes: string[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-body">現実的な見通し</CardTitle>
			</CardHeader>
			<CardContent>
				{notes.length === 0 ? (
					<p className="text-caption text-neutral-600">
						見通しのメモは今週なし。
					</p>
				) : (
					<ul className="list-disc space-y-1 pl-5 text-body text-neutral-900">
						{withDuplicateKeys(notes, String).map((note) => (
							<li key={note.key}>{note.item}</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
