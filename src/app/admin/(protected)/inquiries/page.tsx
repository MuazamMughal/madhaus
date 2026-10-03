import type { Metadata } from "next";
import { InquiryRow } from "@/components/admin/inquiry-row";
import { requirePermission } from "@/lib/auth/permissions";
import { listInquiries } from "@/server/inquiry-service";

export const metadata: Metadata = { title: "Enquiries", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InquiriesPage({ searchParams }: PageProps<"/admin/inquiries">) {
  await requirePermission("booking.view");

  const params = await searchParams;
  const status = (Array.isArray(params.status) ? params.status[0] : params.status) ?? "";
  const inquiries = await listInquiries({ status: status || undefined, limit: 200 });

  const filters = [
    { value: "", label: "All" },
    { value: "new", label: "New" },
    { value: "in_progress", label: "In progress" },
    { value: "answered", label: "Answered" },
    { value: "closed", label: "Closed" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-headline">Enquiries</h1>
        <p className="mt-2 text-sm text-grey-400">
          Messages from the contact form and private event requests.
        </p>
      </header>

      <nav aria-label="Filter enquiries" className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <a
            key={filter.value}
            href={filter.value ? `/admin/inquiries?status=${filter.value}` : "/admin/inquiries"}
            aria-current={status === filter.value ? "true" : undefined}
            className={`font-display flex min-h-10 items-center border px-4 text-xs uppercase ${
              status === filter.value ? "border-lime text-lime" : "border-charcoal-line text-grey-300"
            }`}
          >
            {filter.label}
          </a>
        ))}
      </nav>

      {inquiries.length === 0 ? (
        <div className="hatch border border-dashed border-charcoal-line p-10 text-center">
          <p className="font-display text-title">Nothing here</p>
          <p className="mt-2 text-sm text-grey-400">No enquiries match this filter.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {inquiries.map((inquiry) => (
            <InquiryRow
              key={inquiry.id}
              inquiry={{ ...inquiry, createdAt: inquiry.createdAt.toISOString() }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
