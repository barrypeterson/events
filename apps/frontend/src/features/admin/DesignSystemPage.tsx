import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getCategoryColor } from '@/lib/utils'
import {
  Calendar,
  MapPin,
  Search,
  Menu,
  Heart,
  ExternalLink,
  Share2,
  ArrowLeft,
  Music2,
  TrendingUp,
  Repeat,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Users,
  Star,
  Bell,
  Settings,
  Plus,
  Trash2,
  Edit,
  Eye,
  Download,
  Upload,
  Filter,
  MoreHorizontal,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
} from 'lucide-react'

const CATEGORIES = [
  'music',
  'comedy',
  'sports',
  'arts',
  'food',
  'theater',
  'festival',
  'education',
  'community',
  'nightlife',
]

const COLOR_TOKENS = [
  { name: 'Background', var: '--background', class: 'bg-background' },
  { name: 'Foreground', var: '--foreground', class: 'bg-foreground' },
  { name: 'Primary', var: '--primary', class: 'bg-primary' },
  { name: 'Primary Foreground', var: '--primary-foreground', class: 'bg-primary-foreground' },
  { name: 'Secondary', var: '--secondary', class: 'bg-secondary' },
  { name: 'Muted', var: '--muted', class: 'bg-muted' },
  { name: 'Muted Foreground', var: '--muted-foreground', class: 'bg-muted-foreground' },
  { name: 'Accent', var: '--accent', class: 'bg-accent' },
  { name: 'Destructive', var: '--destructive', class: 'bg-destructive' },
  { name: 'Border', var: '--border', class: 'bg-border' },
  { name: 'Ring', var: '--ring', class: 'bg-ring' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <Separator />
      {children}
    </section>
  )
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

export function DesignSystemPage() {
  const [inputValue, setInputValue] = useState('')
  const [checked, setChecked] = useState(false)

  return (
    <div className="mx-auto max-w-5xl space-y-12 py-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Design System</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          SLO Events platform component reference
        </p>
      </div>

      {/* Colors */}
      <Section title="Colors">
        <Subsection title="Design Tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {COLOR_TOKENS.map((token) => (
              <div key={token.name} className="space-y-1.5">
                <div
                  className={`h-12 w-full rounded-md border ${token.class}`}
                />
                <p className="text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">{token.var}</p>
              </div>
            ))}
          </div>
        </Subsection>

        <Subsection title="Category Colors">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <span
                key={cat}
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getCategoryColor(cat)}`}
              >
                {cat}
              </span>
            ))}
          </div>
        </Subsection>
      </Section>

      {/* Typography */}
      <Section title="Typography">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">text-4xl / bold / tracking-tight</p>
            <p className="text-4xl font-bold tracking-tight">Page Title</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">text-2xl / semibold / tracking-tight</p>
            <p className="text-2xl font-semibold tracking-tight">Section Heading</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">text-xl / semibold</p>
            <p className="text-xl font-semibold">Card Title</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">text-lg / medium</p>
            <p className="text-lg font-medium">Subsection Heading</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">text-base (default)</p>
            <p className="text-base">Body text for descriptions and content blocks.</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">text-sm / muted-foreground</p>
            <p className="text-sm text-muted-foreground">Secondary text, captions, and metadata.</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">text-xs / muted-foreground</p>
            <p className="text-xs text-muted-foreground">Fine print, timestamps, labels.</p>
          </div>
        </div>
      </Section>

      {/* Spacing & Radius */}
      <Section title="Spacing & Radius">
        <Subsection title="Border Radius (--radius: 0.5rem)">
          <div className="flex items-end gap-4">
            <div className="space-y-1 text-center">
              <div className="h-16 w-16 rounded-sm border bg-muted" />
              <p className="text-xs text-muted-foreground">rounded-sm</p>
            </div>
            <div className="space-y-1 text-center">
              <div className="h-16 w-16 rounded-md border bg-muted" />
              <p className="text-xs text-muted-foreground">rounded-md</p>
            </div>
            <div className="space-y-1 text-center">
              <div className="h-16 w-16 rounded-lg border bg-muted" />
              <p className="text-xs text-muted-foreground">rounded-lg</p>
            </div>
            <div className="space-y-1 text-center">
              <div className="h-16 w-16 rounded-full border bg-muted" />
              <p className="text-xs text-muted-foreground">rounded-full</p>
            </div>
          </div>
        </Subsection>
      </Section>

      {/* Buttons */}
      <Section title="Button">
        <Subsection title="Variants">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </Subsection>

        <Subsection title="Sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon"><Plus className="h-4 w-4" /></Button>
          </div>
        </Subsection>

        <Subsection title="With Icons">
          <div className="flex flex-wrap items-center gap-3">
            <Button><Search className="mr-2 h-4 w-4" /> Search Events</Button>
            <Button variant="outline"><Filter className="mr-2 h-4 w-4" /> Filter</Button>
            <Button variant="secondary"><Share2 className="mr-2 h-4 w-4" /> Share</Button>
            <Button variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
          </div>
        </Subsection>

        <Subsection title="States">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Enabled</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Subsection>
      </Section>

      {/* Badge */}
      <Section title="Badge">
        <Subsection title="Variants">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Subsection>

        <Subsection title="Category Badges (getCategoryColor)">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <Badge key={cat} className={getCategoryColor(cat)} variant="secondary">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Badge>
            ))}
          </div>
        </Subsection>
      </Section>

      {/* Card */}
      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description with supporting text.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Card content area with body text and layout.</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Action</Button>
              <Button size="sm" variant="outline">Cancel</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                  <Music2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">SLO Brew Rock</CardTitle>
                  <CardDescription>Live Music Venue</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge className={getCategoryColor('music')} variant="secondary">Music</Badge>
                <Badge className={getCategoryColor('nightlife')} variant="secondary">Nightlife</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Input & Form Controls */}
      <Section title="Input & Form Controls">
        <div className="grid gap-6 sm:grid-cols-2">
          <Subsection title="Text Input">
            <div className="space-y-2">
              <Label htmlFor="demo-input">Event name</Label>
              <Input
                id="demo-input"
                placeholder="Search events..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
            </div>
          </Subsection>

          <Subsection title="Disabled Input">
            <div className="space-y-2">
              <Label htmlFor="disabled-input">Disabled</Label>
              <Input id="disabled-input" placeholder="Cannot edit" disabled />
            </div>
          </Subsection>

          <Subsection title="Checkbox">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="demo-checkbox"
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
              />
              <Label htmlFor="demo-checkbox">Show past events</Label>
            </div>
          </Subsection>

          <Subsection title="Select">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Subsection>
        </div>
      </Section>

      {/* Tabs */}
      <Section title="Tabs">
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="tonight">Tonight</TabsTrigger>
            <TabsTrigger value="weekend">This Weekend</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">All upcoming events in SLO.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="tonight">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Events happening tonight.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="weekend">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Saturday and Sunday events.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="past">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Past events archive.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      {/* Dialog */}
      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Action</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this event? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button variant="destructive">Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      {/* Dropdown Menu */}
      <Section title="Dropdown Menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <MoreHorizontal className="mr-2 h-4 w-4" /> Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Event Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem><Eye className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
            <DropdownMenuItem><Edit className="mr-2 h-4 w-4" /> Edit Event</DropdownMenuItem>
            <DropdownMenuItem><Share2 className="mr-2 h-4 w-4" /> Share</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* Table */}
      <Section title="Table">
        <Table>
          <TableCaption>Recent scraper runs</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Venue</TableHead>
              <TableHead>Scraper</TableHead>
              <TableHead>Events Found</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Fremont Theater</TableCell>
              <TableCell>claude-universal</TableCell>
              <TableCell>12</TableCell>
              <TableCell>3.2s</TableCell>
              <TableCell className="text-right">
                <Badge className="bg-green-100 text-green-700">Success</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">SLO Brew Rock</TableCell>
              <TableCell>agent-browser</TableCell>
              <TableCell>8</TableCell>
              <TableCell>5.1s</TableCell>
              <TableCell className="text-right">
                <Badge className="bg-green-100 text-green-700">Success</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">PAC SLO</TableCell>
              <TableCell>claude-playwright</TableCell>
              <TableCell>0</TableCell>
              <TableCell>12.4s</TableCell>
              <TableCell className="text-right">
                <Badge variant="destructive">Failed</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      {/* Avatar */}
      <Section title="Avatar">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src="https://api.dicebear.com/7.x/initials/svg?seed=SB" />
            <AvatarFallback>SB</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarImage src="https://api.dicebear.com/7.x/initials/svg?seed=FT" />
            <AvatarFallback>FT</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>PS</AvatarFallback>
          </Avatar>
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-lg">SLO</AvatarFallback>
          </Avatar>
        </div>
      </Section>

      {/* Skeleton */}
      <Section title="Skeleton">
        <div className="space-y-4">
          <Subsection title="Card Loading State">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          </Subsection>

          <Subsection title="Event List Loading">
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <Skeleton className="h-40 w-full rounded-t-lg" />
                  <CardContent className="space-y-2 pt-4">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Subsection>
        </div>
      </Section>

      {/* Separator */}
      <Section title="Separator">
        <div className="space-y-4">
          <div>
            <p className="text-sm">Horizontal separator</p>
            <Separator className="my-2" />
            <p className="text-sm text-muted-foreground">Content below</p>
          </div>
          <div className="flex h-8 items-center gap-4">
            <span className="text-sm">Item A</span>
            <Separator orientation="vertical" />
            <span className="text-sm">Item B</span>
            <Separator orientation="vertical" />
            <span className="text-sm">Item C</span>
          </div>
        </div>
      </Section>

      {/* ScrollArea */}
      <Section title="Scroll Area">
        <ScrollArea className="h-48 w-full rounded-md border p-4">
          <div className="space-y-4">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium">Event #{i + 1}</p>
                  <p className="text-xs text-muted-foreground">Venue {i + 1} at 7:00 PM</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>

      {/* Icons */}
      <Section title="Icons (lucide-react)">
        <p className="text-sm text-muted-foreground">Commonly used across the platform:</p>
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8">
          {[
            { icon: Calendar, name: 'Calendar' },
            { icon: MapPin, name: 'MapPin' },
            { icon: Search, name: 'Search' },
            { icon: Menu, name: 'Menu' },
            { icon: Heart, name: 'Heart' },
            { icon: ExternalLink, name: 'ExternalLink' },
            { icon: Share2, name: 'Share2' },
            { icon: ArrowLeft, name: 'ArrowLeft' },
            { icon: Music2, name: 'Music2' },
            { icon: TrendingUp, name: 'TrendingUp' },
            { icon: Repeat, name: 'Repeat' },
            { icon: X, name: 'X' },
            { icon: Check, name: 'Check' },
            { icon: ChevronDown, name: 'ChevronDown' },
            { icon: ChevronRight, name: 'ChevronRight' },
            { icon: Clock, name: 'Clock' },
            { icon: Users, name: 'Users' },
            { icon: Star, name: 'Star' },
            { icon: Bell, name: 'Bell' },
            { icon: Settings, name: 'Settings' },
            { icon: Plus, name: 'Plus' },
            { icon: Trash2, name: 'Trash2' },
            { icon: Edit, name: 'Edit' },
            { icon: Eye, name: 'Eye' },
            { icon: Download, name: 'Download' },
            { icon: Upload, name: 'Upload' },
            { icon: Filter, name: 'Filter' },
            { icon: MoreHorizontal, name: 'More' },
            { icon: AlertCircle, name: 'AlertCircle' },
            { icon: Info, name: 'Info' },
            { icon: CheckCircle, name: 'CheckCircle' },
            { icon: XCircle, name: 'XCircle' },
          ].map(({ icon: Icon, name }) => (
            <div key={name} className="flex flex-col items-center gap-1.5 rounded-md border p-3">
              <Icon className="h-5 w-5" />
              <span className="text-[10px] text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Composed Patterns */}
      <Section title="Composed Patterns">
        <Subsection title="Event Card (mock)">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="overflow-hidden">
              <div className="h-40 bg-gradient-to-br from-purple-500 to-pink-500" />
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">Jazz Night at SLO Brew</CardTitle>
                  <Music2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Fri, Apr 18 at 7:00 PM</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>SLO Brew Rock</span>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Badge className={getCategoryColor('music')} variant="secondary">Music</Badge>
                  <Badge className={getCategoryColor('nightlife')} variant="secondary">Nightlife</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-40 bg-gradient-to-br from-green-500 to-emerald-500" />
              <CardContent className="space-y-2 pt-4">
                <CardTitle className="text-lg">Farmers Market</CardTitle>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Thu, Apr 17 at 6:00 PM</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Higuera Street</span>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Badge className={getCategoryColor('food')} variant="secondary">Food</Badge>
                  <Badge className={getCategoryColor('community')} variant="secondary">Community</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-40 bg-gradient-to-br from-orange-500 to-red-500" />
              <CardContent className="space-y-2 pt-4">
                <CardTitle className="text-lg">Stand-Up Comedy Night</CardTitle>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Sat, Apr 19 at 8:00 PM</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>The Fremont Theater</span>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Badge className={getCategoryColor('comedy')} variant="secondary">Comedy</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </Subsection>

        <Subsection title="Tonight Mode Section Header (mock)">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <h3 className="text-lg font-semibold">Happening Now</h3>
              <Badge variant="secondary" className="ml-1">2 events</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Coming Up</h3>
              <Badge variant="secondary" className="ml-1">3 events</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Later Tonight</h3>
              <Badge variant="secondary" className="ml-1">5 events</Badge>
            </div>
          </div>
        </Subsection>

        <Subsection title="Empty State (mock)">
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">SLO is quiet tonight</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              No events found for this evening. Check back tomorrow.
            </p>
            <Button variant="outline" className="mt-4">
              <ChevronRight className="mr-2 h-4 w-4" /> See This Weekend
            </Button>
          </Card>
        </Subsection>

        <Subsection title="Alert / Status States">
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Scraper completed successfully. 12 events found.</span>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              <Info className="h-4 w-4 shrink-0" />
              <span>Running scraper for Fremont Theater. This may take a moment.</span>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Spotify connection expired. Events shown in chronological order.</span>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>Scraper failed. Check API key configuration.</span>
            </div>
          </div>
        </Subsection>
      </Section>
    </div>
  )
}
