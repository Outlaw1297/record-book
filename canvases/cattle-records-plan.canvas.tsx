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
        <H1>HerdLedger — Plan</H1>
        <Text tone="secondary">
          Digital twin of your myHERD.org / American Hereford Association pocket
          book. Offline SQLite on phone and desktop; Google Drive or Dropbox
          sync when cell service returns.
        </Text>
        <Row gap={8} wrap>
          <Pill tone="info">Cow–Calf</Pill>
          <Pill tone="info">Breeding</Pill>
          <Pill tone="info">Pasture</Pill>
          <Pill tone="info">Sales</Pill>
          <Pill tone="warning">Some pages pending</Pill>
        </Row>
      </Stack>

      <Callout tone="warning" title="Upload size limit">
        A few notebook photos did not arrive. Re-send remaining pages as
        smaller JPEGs (or a few at a time) and we will add those sections.
        Plan below is locked to the pages we have.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="4" label="Book sections mapped" tone="info" />
        <Stat value="SQLite" label="Works offline" />
        <Stat value="Drive/Dropbox" label="Sync backend" tone="success" />
        <Stat value="Flutter" label="Phone + desktop" />
      </Grid>

      <Divider />

      <H2>Sections from your notebook</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill size="sm">p.16–17</Pill>}>
            Cow – Calf Record
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>
                Calf ID · Cow ID · Sire (or open) · Sex · Calving date · Birth
                weight/codes · Calv EZ · Remarks
              </Text>
              <Text tone="secondary">
                Tag colors in IDs (y/w/g/…). Supports open cows with no calf.
                Remark chips: poll, GAGM, FAGM, preme pull.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Breeding Record</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>
                Cow ID · AI 1st (sire + date) · AI 2nd · Pasture service
              </Text>
              <Text tone="secondary">
                Phenotype + tag in ID (BLK 455org, BWF 40pk). Circled rows →
                flagged.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill size="sm">e.g. OLD COWS</Pill>}>
            Pasture Exposure
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>Pasture name · Bull in / out dates · Animal lists</Text>
              <Text tone="secondary">
                Flexible bull/cow columns, notes (+3.3, BLK, Red, BHFD), counts,
                flagged animals.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill size="sm">2026</Pill>}>
            Sale Record
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text>Calf ID · Sex · Sold to · Date · Price</Text>
              <Text tone="secondary">
                Status notes (gimp, udder, old). x-prefix / circles as sold or
                flagged markers.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>ID conventions (keep as you write them)</H2>
      <Table
        headers={["Pattern", "Meaning", "App handling"]}
        rows={[
          ["67y / 247w / 528 pk", "Number + ear-tag color", "Free-text herd ID + optional tagColor"],
          ["BLK / BWF / BBF / RWF", "Phenotype / color type", "Optional phenotype field"],
          ["open", "Cow not bred / no calf", "Status on cow–calf or breeding row"],
          ["x227w", "Marked / sold / done", "Flag or status toggle"],
          ["+3.3", "Metric on pasture list", "Optional numeric note on exposure"],
        ]}
      />

      <Divider />

      <H2>Offline / online sync</H2>
      <Card>
        <CardBody>
          <Stack gap={10}>
            <Text weight="medium">
              Phone SQLite ↔ Drive or Dropbox /RecordBook/ ↔ Desktop SQLite
            </Text>
            <Table
              headers={["Cloud path", "Role"]}
              rows={[
                ["changes/<device>/…", "Append-only edits while online"],
                ["snapshots/…", "Full DB for new device / recovery"],
                ["media/…", "Photos when bandwidth allows"],
              ]}
            />
            <Text tone="secondary">
              No internet required to add a calf or breeding row. Sync runs when
              the phone has service or the desktop is online.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H2>Build order</H2>
      <Stack gap={8}>
        <Row gap={8} align="start">
          <Pill tone="warning">0</Pill>
          <Text>Ingest any remaining book pages (compressed uploads OK)</Text>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="info">1</Pill>
          <Text>Offline Cow–Calf list + form (exact columns)</Text>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="info">2</Pill>
          <Text>Breeding · Pasture Exposure · Sales</Text>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="neutral">3</Pill>
          <Text>Google Drive / Dropbox sync + conflict UI</Text>
        </Row>
        <Row gap={8} align="start">
          <Pill tone="neutral">4</Pill>
          <Text>Desktop grids, CSV/print, remark chips</Text>
        </Row>
      </Stack>

      <Divider />

      <H2>Still need from you</H2>
      <Card>
        <CardBody>
          <Stack gap={6}>
            <H3>Missing pages + choices</H3>
            <Text>
              • Re-upload remaining notebook pages (smaller files if needed)
            </Text>
            <Text>• Drive vs Dropbox vs pick-at-setup</Text>
            <Text>• Phone OS + desktop OS priority</Text>
            <Text>• One user vs phone + office PC at the same time</Text>
            <Text>
              • Tag color: separate picker, or leave inside the ID string?
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="info" title="Full write-up">
        docs/plan/cattle-records-app-plan.md · photos in
        docs/plan/reference-photos/
      </Callout>
    </Stack>
  );
}
