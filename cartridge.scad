// Bench cartridge, millimetres. Origin at port centreline and sill elevation.
// Preview with F5. Select one part, render with F6, then export STL or DXF.
// Stock and drill templates only. Survey the purchased actuator for its pin fit.
part = "assembly"; // [assembly,leaf,guide_left,guide_right,sill,divider_template]
lift = 18; // [0:1:50]
$fn=40;
module leaf(){
    // Clevis mounts separately. Transfer-drill its hole pattern after alignment.
    translate([-58,0,0]) cube([116,2,74]);
}
module guide(left=true){
    // Mirrored channels. The inboard shoulders sit 117 mm apart.
    module blank(){
        difference(){
            translate([53,-3,0]) cube([14,8,145]);
            translate([52,-0.5,-1]) cube([6.5,3,147]);
            for(z=[7,65,128])
                translate([63,6,z]) rotate([90,0,0]) cylinder(d=4.5,h=10);
        }
    }
    if(left) mirror([1,0,0]) blank(); else blank();
}
module sill(){translate([-65,-6,-8]) cube([130,15,8]);}
module divider_template(){
    difference(){
        translate([-80,-15]) square([160,380]);
        translate([-50,0]) square([100,50]);
        for(x=[-63,63], z=[7,65,128]) translate([x,z]) circle(d=4.5);
    }
}
if(part=="leaf") leaf();
if(part=="guide_left") guide(true);
if(part=="guide_right") guide(false);
if(part=="sill") sill();
if(part=="divider_template") divider_template();
if(part=="assembly"){
    color("silver")translate([0,0,lift]) leaf();
    color("teal"){guide(true);guide(false);}
    color("dimgray") sill();
    color([.6,.8,.85,.35])translate([0,11,0])rotate([90,0,0])
        linear_extrude(2) divider_template();
}
