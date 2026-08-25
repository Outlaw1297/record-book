import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

export default function CattleRecordsPlanCanvas() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Cattle Record Book — Plan</H1>
        <Text tone="secondary">
          Offline-first mobile + desktop app. Local SQLite on every device;
          Google Drive or Dropbox as the shared sync backend when cell service
          or Wi‑Fi is available.
        </Text>
        <Row gap={8} wrap>
          <Pill tone="info">Offline-first</Pill>
          <Pill tone="neutral">Phone + desktop</Pill>
          <Pill tone="neutral">Drive / Dropbox sync</Pill>
          <Pill tone="warning">Photos pending</Pill>
        </Row>
      </Stack>

      <Callout tone="warning" title="Reference photos not in this session">
        The agent did not receive photos of your paper record book. The field
        model below is a standard ranch baseline — re-attach page photos so we
        can match your exact columns and layout.
      </Callout>

      <Grid columns={3} gap={12}>
        <Stat value="2" label="Clients" tone="info" />
        <Stat value="SQLite" label="Local source of truth" />
        <Stat value="Folder sync" label="Cloud backend" tone="success" />
      </Grid>

      <Divider />

      <H2>How it works offline / online</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>On the phone (field)</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                Full animal lookup and entry against local SQLite — no network
                required. Changes queue in an outbox.
              </Text>
              <Text tone="secondary">
                When service returns, outbox uploads to Drive/Dropbox and peer
                changes download automatically (or via Sync now).
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>On the desktop (office)</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                Same herd database locally. Dense tables, filters, and
                print/CSV for inventory, calving, and sale sheets.
              </Text>
              <Text tone="secondary">
                Shares one RecordBook folder with the phone so both stay in
                sync when either is online.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader>Sync architecture</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Text weight="medium">
              Mobile SQLite  ↔  Drive/Dropbox folder  ↔  Desktop SQLite
            </Text>
            <Text tone="secondary">
              Drive/Dropbox store change logs (JSONL), periodic SQLite
              snapshots, and animal photos — not a live remote database.
              Last-write-wins conflicts are logged for review.
            </Text>
            <Table
              headers={["Path", "Role"]}
              rows={[
                ["/RecordBook/changes/<device>/…", "Append-only change files"],
                ["/RecordBook/snapshots/…", "Bootstrap + recovery DB copies"],
                ["/RecordBook/media/<animal>/…", "Photos synced when online"],
                ["/RecordBook/config.json", "Schema version + ranch id"],
              ]}
            />
          </Stack>
        </CardBody>
      </Card>

      <Divider />

      <H2>Apps & UX</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill size="sm">Mobile</Pill>}>
            Field UI
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>• Big search by ear tag / name</Text>
              <Text>• Quick-add: calf, treatment, weight, move</Text>
              <Text>• Animal timeline (birth → health → breeding)</Text>
              <Text>• Offline banner + last synced time</Text>
              <Text>• Glove-friendly 44px+ targets</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill size="sm">Desktop</Pill>}>
            Office UI
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>• Herd table with filters & sort</Text>
              <Text>• Detail drawer / split pane</Text>
              <Text>• Due calvings & withdrawal alerts</Text>
              <Text>• CSV / print exports</Text>
              <Text>• Conflict review after multi-device edits</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>Data model (baseline — tune to your book)</H2>
      <Table
        headers={["Entity", "Key fields"]}
        rows={[
          [
            "Animal",
            "Tag, tattoo/EID, sex, breed, birth, status, pasture, dam/sire",
          ],
          ["Breeding / calving", "Service date, bull/AI, calving, calf, weaning"],
          ["Health", "Date, product, dose, withdrawal, vet flag"],
          ["Weights", "Date, weight, method"],
          ["Moves / sales", "From/to, purchase/sale price & counterparty"],
        ]}
      />

      <Divider />

      <H2>Recommended stack</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Primary recommendation</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text weight="medium">Flutter + SQLite (Drift)</Text>
              <Text tone="secondary">
                One codebase for iOS, Android, Windows, and macOS. Strong
                offline story for ranch use.
              </Text>
              <Text tone="secondary">
                Google Drive API + Dropbox API behind a shared CloudStore
                interface.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>UI skill</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text weight="medium">ui-design-brain (installed)</Text>
              <Text tone="secondary">
                Global + project skill for production UI patterns. Desktop:
                enterprise/data-dense. Mobile: large-touch field flows.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>Build phases</H2>
      <Stack gap={8}>
        <Row gap={8} align="start">
          <Pill tone="warning">0</Pill>
          <Stack gap={2}>
            <Text weight="medium">Align with paper book</Text>
            <Text tone="secondary">
              Review photos; lock field names and screen wireframes.
            </Text>
          </Stack>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="info">1</Pill>
          <Stack gap={2}>
            <Text weight="medium">Offline MVP (single device)</Text>
            <Text tone="secondary">
              Animal list/detail/CRUD on local SQLite — prove field usability.
            </Text>
          </Stack>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="info">2</Pill>
          <Stack gap={2}>
            <Text weight="medium">Cloud sync</Text>
            <Text tone="secondary">
              Drive + Dropbox adapters, outbox/inbox, snapshots, sync UI.
            </Text>
          </Stack>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="neutral">3</Pill>
          <Stack gap={2}>
            <Text weight="medium">Desktop polish & exports</Text>
            <Text tone="secondary">
              Reports, breeding calendar, photo gallery.
            </Text>
          </Stack>
        </Row>
      </Stack>

      <Divider />

      <H2>Decisions needed from you</H2>
      <Card>
        <CardBody>
          <Stack gap={8}>
            <H3>Open questions</H3>
            <Text>1. Google Drive, Dropbox, or user choice at setup?</Text>
            <Text>2. Android / iPhone / both? Windows and/or Mac?</Text>
            <Text>3. Re-share paper book photos for exact field mapping.</Text>
            <Text>
              4. One user, or phone + office PC editing the same herd at once?
            </Text>
            <Text>
              5. Must-have v1 reports (inventory, calves this year, withdrawals)?
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="info" title="Full write-up">
        Detailed plan: docs/plan/cattle-records-app-plan.md
      </Callout>
    </Stack>
  );
}
