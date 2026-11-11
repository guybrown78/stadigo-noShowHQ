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
        <div className="mb-8">
          <Link href="/login" className="inline-flex">
            <BrandMark />
          </Link>
          <h1 className="mt-6 text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h1>
        </div>
        <Card>
          <CardBody className="p-6">{children}</CardBody>
        </Card>
        {footer ? (
          <div className="mt-4 text-sm text-muted">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
