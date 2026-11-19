import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Toggle } from "@/components/ui/toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";

// Leftover component gallery: guarantees button-group, input-group,
// input-otp, item, navigation-menu, toggle are all imported/used.
export default function Showcase() {
  const [otp, setOtp] = useState("");
  const [bold, setBold] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="#">Gallery</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#">Docs</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Button group + Toggle</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <ButtonGroup>
              <Button variant="outline" size="sm">
                Day
              </Button>
              <Button variant="outline" size="sm">
                Week
              </Button>
              <Button variant="outline" size="sm">
                Month
              </Button>
            </ButtonGroup>
            <Toggle pressed={bold} onPressedChange={setBold}>
              B
            </Toggle>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input group</CardTitle>
          </CardHeader>
          <CardContent>
            <InputGroup>
              <InputGroupAddon>
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search runners…" />
            </InputGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">One-time code ({otp.length}/6)</CardTitle>
          </CardHeader>
          <CardContent>
            <InputOTP maxLength={6} value={otp} onChange={setOtp}>
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              <Item>
                <ItemContent>
                  <ItemTitle>daemon-01</ItemTitle>
                  <ItemDescription>healthy · 4 runners</ItemDescription>
                </ItemContent>
              </Item>
              <Item>
                <ItemContent>
                  <ItemTitle>daemon-02</ItemTitle>
                  <ItemDescription>draining · 1 runner</ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
