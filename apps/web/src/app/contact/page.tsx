import { SimplePage } from "@/components/layout/simple-page";

export const metadata = { title: "Contact — Pitchside" };
export default function Contact() {
  return (
    <SimplePage title="Contact">
      <p>Questions or want to list your venue? Email <a className="text-pitch-400 underline" href="mailto:hello@pitchside.example">hello@pitchside.example</a>.</p>
    </SimplePage>
  );
}
