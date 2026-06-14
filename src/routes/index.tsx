import { createFileRoute } from "@tanstack/react-router";
import { TeardownView } from "@/components/TeardownView";
import { AppNav } from "@/components/AppNav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Product Teardown Generator" },
      {
        name: "description",
        content:
          "Pick an app and get a LinkedIn-ready product teardown post written from a student PM perspective.",
      },
      { property: "og:title", content: "Product Teardown Generator" },
      {
        property: "og:description",
        content:
          "Pick an app and get a LinkedIn-ready product teardown post written from a student PM perspective.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[720px]">
        <AppNav />
        <TeardownView />
      </div>
    </div>
  );
}
