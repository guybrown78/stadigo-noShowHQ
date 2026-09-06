import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { Card, CardBody } from "@/components/ui/card";

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/login" className="inline-flex justify-center">
            <BrandMark />
          </Link>
          <h1 className="mt-4 text-xl font-medium text-slate-800">{title}</h1>
        </div>
        <Card>
          <CardBody className="p-6">{children}</CardBody>
        </Card>
        {footer ? (
          <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
