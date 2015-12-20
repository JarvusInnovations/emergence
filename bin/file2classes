#!/usr/bin/perl

die("file required") unless $filename = $ARGV[0];
$basename = `basename $filename .php`;
chomp $basename;

open FILE, ">$basename.header.php" or die $!;
open INFILE, $filename or die $!;

while(<INFILE>)
{
        if(/^(abstract\s+)?(class|interface)\s+([a-zA-Z0-9_]+)/)
        {
                print "Found $2: $3\n";
                close FILE;
                open FILE, ">$3.class.php";
                print FILE "<?php\n\n";
        }

        print FILE;
}

close FILE;
close INFILE;
