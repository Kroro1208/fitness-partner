"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	profileQueryOptions,
	updateProfileMutationOptions,
} from "@/hooks/use-profile";
import {
	buildUpdateInput,
	type ProfileData,
	type ProfileField,
} from "@/lib/profile/build-update-input";

const SECTION_KEYS = ["body", "activity", "wellness"] as const;
type Section = (typeof SECTION_KEYS)[number];

const FIELD_LABELS: Record<ProfileField, string> = {
	age: "年齢",
	sex: "性別",
	heightCm: "身長",
	weightKg: "体重",
	activityLevel: "活動レベル",
	desiredPace: "目標ペース",
	sleepHours: "睡眠時間",
	stressLevel: "ストレス",
};

const FIELD_UNITS: Partial<Record<ProfileField, string>> = {
	age: "歳",
	heightCm: "cm",
	weightKg: "kg",
	sleepHours: "時間",
};

const SEX_LABELS: Record<string, string> = {
	male: "男性",
	female: "女性",
};

const ACTIVITY_LEVEL_LABELS: Record<string, string> = {
	sedentary: "ほぼ座り仕事",
	light: "軽い活動",
	moderate: "中程度の活動",
	active: "活発",
	very_active: "非常に活発",
};

const DESIRED_PACE_LABELS: Record<string, string> = {
	steady: "じっくり",
	aggressive: "早めに",
};

const SECTIONS = {
	body: {
		title: "身体情報",
		description: "年齢・性別・身長・体重",
		fields: ["age", "sex", "heightCm", "weightKg"],
	},
	activity: {
		title: "活動レベル",
		description: "活動レベルと目標ペース",
		fields: ["activityLevel", "desiredPace"],
	},
	wellness: {
		title: "ウェルネス",
		description: "睡眠時間とストレスレベル",
		fields: ["sleepHours", "stressLevel"],
	},
} as const satisfies Record<
	Section,
	{ title: string; description: string; fields: readonly ProfileField[] }
>;

function formatValue(field: ProfileField, value: unknown): string {
	if (value === null || value === undefined) return "—";
	if (field === "sex" && typeof value === "string") {
		return SEX_LABELS[value] ?? value;
	}
	if (field === "activityLevel" && typeof value === "string") {
		return ACTIVITY_LEVEL_LABELS[value] ?? value;
	}
	if (field === "desiredPace" && typeof value === "string") {
		return DESIRED_PACE_LABELS[value] ?? value;
	}
	const unit = FIELD_UNITS[field];
	return unit ? `${value} ${unit}` : String(value);
}

export default function ProfilePage() {
	const { data, isLoading, isError, refetch } = useQuery(profileQueryOptions());
	const [editing, setEditing] = useState<Section | null>(null);

	if (isLoading) {
		return (
			<div className="space-y-4">
				{SECTION_KEYS.map((section) => (
					<Card key={`skeleton-${section}`}>
						<CardHeader>
							<CardTitle>
								<div className="h-5 w-32 bg-neutral-100 rounded" />
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="h-4 w-full bg-neutral-100 rounded" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>エラー</CardTitle>
					<CardDescription>プロフィールの取得に失敗しました</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => refetch()}>再試行</Button>
				</CardContent>
			</Card>
		);
	}

	if (!data) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>プロフィール未作成</CardTitle>
					<CardDescription>オンボーディングを完了してください</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{SECTION_KEYS.map((section) => (
				<ProfileSection
					key={section}
					section={section}
					profile={data}
					isEditing={editing === section}
					onEdit={() => setEditing(section)}
					onCancel={() => setEditing(null)}
					onSaved={() => setEditing(null)}
				/>
			))}
		</div>
	);
}

interface ProfileSectionProps {
	section: Section;
	profile: ProfileData;
	isEditing: boolean;
	onEdit: () => void;
	onCancel: () => void;
	onSaved: () => void;
}

function ProfileSection({
	section,
	profile,
	isEditing,
	onEdit,
	onCancel,
	onSaved,
}: ProfileSectionProps) {
	const meta = SECTIONS[section];

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between">
				<div>
					<CardTitle>{meta.title}</CardTitle>
					<CardDescription>{meta.description}</CardDescription>
				</div>
				{!isEditing && (
					<Button variant="outline" size="sm" onClick={onEdit}>
						編集
					</Button>
				)}
			</CardHeader>
			<CardContent>
				{isEditing ? (
					<ProfileEditForm
						fields={meta.fields}
						profile={profile}
						onCancel={onCancel}
						onSaved={onSaved}
					/>
				) : (
					<dl className="grid grid-cols-2 gap-3 text-body">
						{meta.fields.map((field) => (
							<div key={field}>
								<dt className="text-caption text-neutral-600">
									{FIELD_LABELS[field]}
								</dt>
								<dd className="font-medium text-neutral-900 tabular">
									{formatValue(field, profile[field])}
								</dd>
							</div>
						))}
					</dl>
				)}
			</CardContent>
		</Card>
	);
}

interface ProfileEditFormProps {
	fields: readonly ProfileField[];
	profile: ProfileData;
	onCancel: () => void;
	onSaved: () => void;
}

function ProfileEditForm({
	fields,
	profile,
	onCancel,
	onSaved,
}: ProfileEditFormProps) {
	const queryClient = useQueryClient();
	const update = useMutation(updateProfileMutationOptions(queryClient));
	const [values, setValues] = useState<Partial<Record<ProfileField, string>>>(
		() =>
			Object.fromEntries(
				fields.map((field) => [field, formatValueForInput(profile[field])]),
			),
	);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		const built = buildUpdateInput(fields, values, profile);
		if (!built.ok) {
			setError(built.error.message);
			return;
		}
		try {
			await update.mutateAsync(built.value);
			onSaved();
		} catch (e) {
			setError(e instanceof Error ? e.message : "更新に失敗しました");
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			{fields.map((field) => (
				<div key={field} className="space-y-1.5">
					<Label htmlFor={field}>{FIELD_LABELS[field]}</Label>
					<Input
						id={field}
						value={values[field] ?? ""}
						onChange={(e) =>
							setValues((prev) => ({ ...prev, [field]: e.target.value }))
						}
					/>
				</div>
			))}
			{error && (
				<p className="text-sm text-danger-700" role="alert">
					{error}
				</p>
			)}
			<div className="flex gap-2">
				<Button type="submit" disabled={update.isPending}>
					{update.isPending ? "保存中..." : "保存"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={onCancel}
					disabled={update.isPending}
				>
					キャンセル
				</Button>
			</div>
		</form>
	);
}

function formatValueForInput(value: unknown): string {
	if (value === null || value === undefined) return "";
	return String(value);
}
