import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function CautionBanner({ message }: { message: string }) {
	return (
		<Alert className="border-warning-500 bg-warning-100 text-warning-500">
			<AlertCircle className="h-4 w-4" />
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
